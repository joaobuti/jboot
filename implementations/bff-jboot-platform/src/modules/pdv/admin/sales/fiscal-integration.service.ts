import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../../config/app-config.service';
import { FiscalTokenService } from '../../../../config/fiscal-token.service';
import { SaleItemRow, SalePaymentRow } from './sales.repository';

export interface FiscalEmissaoResult {
  fiscalDocumentId: string;
  status: 'authorized' | 'contingency' | 'failed' | 'uncertain';
  chaveAcesso?: string;
  protocolo?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface FiscalCancelamentoResult {
  status: 'cancelled' | 'failed';
  protocolo?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface EmitenteParams {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  ie?: string;
  uf: string;
  crt: number;
  endereco: {
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    codigoMunicipio: string;
    complemento?: string;
    telefone?: string;
  };
}

const PAYMENT_METHOD_MAP: Record<string, number> = {
  dinheiro: 1,
  cartao_credito: 3,
  cartao_debito: 4,
  pix: 17,
  outro: 99
};

@Injectable()
export class FiscalIntegrationService {
  private readonly logger = new Logger(FiscalIntegrationService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly fiscalToken: FiscalTokenService
  ) {}

  async emitirNfe(params: {
    requestId: string;
    clientId: string;
    cnpjEmitente: string;
    emitente: EmitenteParams;
    destinatario?: {
      cnpj?: string;
      cpf?: string;
      razaoSocial: string;
      endereco?: {
        logradouro: string;
        numero: string;
        bairro: string;
        municipio: string;
        uf: string;
        cep: string;
        codigoMunicipio: string;
      };
    };
    items: SaleItemRow[];
    payments: SalePaymentRow[];
    total: number;
  }): Promise<FiscalEmissaoResult> {
    const url = `${this.config.fiscalServiceUrl}/api/v1/emissao/nfe`;
    const body = {
      request_id: params.requestId,
      cnpj_emitente: params.cnpjEmitente,
      dados_documento: {
        data_emissao: new Date().toISOString(),
        natureza_operacao: 'VENDA',
        finalidade: 1,
        consumidor_final: !params.destinatario,
        presenca: 1,
        emitente: this.buildEmitentePayload(params.emitente),
        destinatario: params.destinatario
          ? {
              razao_social: params.destinatario.razaoSocial,
              cnpj: params.destinatario.cnpj ?? undefined,
              cpf: params.destinatario.cpf ?? undefined,
              endereco: params.destinatario.endereco
                ? {
                    logradouro: params.destinatario.endereco.logradouro,
                    numero: params.destinatario.endereco.numero,
                    bairro: params.destinatario.endereco.bairro,
                    municipio: params.destinatario.endereco.municipio,
                    uf: params.destinatario.endereco.uf,
                    cep: params.destinatario.endereco.cep,
                    codigo_municipio: params.destinatario.endereco.codigoMunicipio
                  }
                : undefined
            }
          : undefined,
        itens: this.buildItens(params.items),
        pagamentos: this.buildPagamentos(params.payments),
        totais: { v_bc: 0, v_icms: 0, v_prod: params.total, v_nf: params.total }
      }
    };
    return this.callFiscalService(url, body, params.clientId, params.requestId);
  }

  async emitirNfce(params: {
    requestId: string;
    clientId: string;
    cnpjEmitente: string;
    emitente: EmitenteParams;
    cpfConsumidor?: string;
    items: SaleItemRow[];
    payments: SalePaymentRow[];
    total: number;
  }): Promise<FiscalEmissaoResult> {
    const url = `${this.config.fiscalServiceUrl}/api/v1/emissao/nfce`;
    const body = {
      request_id: params.requestId,
      cnpj_emitente: params.cnpjEmitente,
      dados_documento: {
        data_emissao: new Date().toISOString(),
        consumidor_final: true,
        presenca: 1,
        cpf_consumidor: params.cpfConsumidor ?? undefined,
        emitente: this.buildEmitentePayload(params.emitente),
        itens: this.buildItens(params.items),
        pagamentos: this.buildPagamentos(params.payments),
        totais: { v_bc: 0, v_icms: 0, v_prod: params.total, v_nf: params.total }
      }
    };
    return this.callFiscalService(url, body, params.clientId, params.requestId);
  }

  async cancelarDocumento(params: {
    clientId: string;
    fiscalDocumentId: string;
    justificativa: string;
  }): Promise<FiscalCancelamentoResult> {
    const url = `${this.config.fiscalServiceUrl}/api/v1/documentos/${params.fiscalDocumentId}/cancelamento`;
    try {
      const s2sToken = await this.fiscalToken.mint(params.clientId);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s2sToken}`,
          'X-Caller-Service': 'bff-platform-pdv'
        },
        body: JSON.stringify({ justificativa: params.justificativa }),
        signal: AbortSignal.timeout(35_000)
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (response.status === 200 || response.status === 201) {
        return { status: 'cancelled', protocolo: data['protocolo'] as string | undefined };
      }
      this.logger.warn('Fiscal cancellation rejected', { status: response.status });
      return {
        status: 'failed',
        errorCode: data['error'] as string | undefined,
        errorMessage: data['sefaz_motivo'] as string | undefined
      };
    } catch (err) {
      this.logger.error('Fiscal service unreachable for cancellation', err);
      return { status: 'failed', errorMessage: 'Fiscal service unavailable' };
    }
  }

  private buildEmitentePayload(emitente: EmitenteParams) {
    return {
      cnpj: emitente.cnpj,
      razao_social: emitente.razaoSocial,
      nome_fantasia: emitente.nomeFantasia,
      ie: emitente.ie,
      uf: emitente.uf,
      crt: emitente.crt,
      endereco: {
        logradouro: emitente.endereco.logradouro,
        numero: emitente.endereco.numero,
        bairro: emitente.endereco.bairro,
        municipio: emitente.endereco.municipio,
        uf: emitente.endereco.uf,
        cep: emitente.endereco.cep,
        codigo_municipio: emitente.endereco.codigoMunicipio,
        complemento: emitente.endereco.complemento,
        telefone: emitente.endereco.telefone
      }
    };
  }

  private buildItens(items: SaleItemRow[]) {
    return items.map((item) => ({
      codigo: item.sku ?? item.productId,
      descricao: item.description,
      ncm: item.ncm,
      cfop: item.cfop ?? undefined,
      unidade: item.unit,
      quantidade: Number(item.quantity),
      valor_unitario: Number(item.unitPrice),
      valor_total: Number(item.total),
      gtin: item.gtin ?? 'SEM GTIN',
      cest: item.cest ?? undefined
    }));
  }

  private buildPagamentos(payments: SalePaymentRow[]) {
    return payments.map((p) => ({
      forma_pagamento: PAYMENT_METHOD_MAP[p.paymentMethod] ?? 99,
      valor: Number(p.amount)
    }));
  }

  private async callFiscalService(
    url: string,
    body: unknown,
    clientId: string,
    requestId: string
  ): Promise<FiscalEmissaoResult> {
    try {
      const s2sToken = await this.fiscalToken.mint(clientId);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s2sToken}`,
          'X-Caller-Service': 'bff-platform-pdv',
          'Idempotency-Key': requestId
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35_000)
      });

      const data = (await response.json()) as Record<string, unknown>;

      const fiscalStatus = typeof data['status'] === 'string' ? data['status'] : undefined;

      if ((response.status === 201 || response.status === 200) && fiscalStatus === 'authorized') {
        return {
          fiscalDocumentId: data['fiscal_document_id'] as string,
          status: 'authorized',
          chaveAcesso: data['chave_acesso'] as string | undefined,
          protocolo: data['protocolo'] as string | undefined
        };
      }

      if (response.status === 202 && fiscalStatus === 'contingency') {
        return {
          fiscalDocumentId: data['fiscal_document_id'] as string,
          status: 'contingency'
        };
      }

      if (response.status >= 500 || fiscalStatus === 'pending') {
        this.logger.warn('Fiscal emission result is uncertain', { status: response.status });
        return {
          fiscalDocumentId: (data['fiscal_document_id'] as string | undefined) ?? '',
          status: 'uncertain',
          errorCode: data['error'] as string | undefined,
          errorMessage: 'Resultado fiscal pendente de reconciliacao'
        };
      }

      this.logger.warn('Fiscal emission rejected', { status: response.status });
      return {
        fiscalDocumentId: (data['fiscal_document_id'] as string | undefined) ?? '',
        status: 'failed',
        errorCode: data['error'] as string | undefined,
        errorMessage: data['sefaz_motivo'] as string | undefined
      };
    } catch (err) {
      this.logger.error('Fiscal service unreachable', err);
      return {
        fiscalDocumentId: '',
        status: 'uncertain',
        errorMessage: 'Fiscal service unavailable; reconciliation required'
      };
    }
  }
}
