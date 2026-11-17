import { Injectable, Logger } from '@nestjs/common';
import { FiscalTokenService } from '../../config/fiscal-token.service';
import { AppConfigService } from '../../config/app-config.service';
import { FiscalConfigResponse, UploadFiscalCertificateDto, UpsertFiscalConfigDto } from './fiscal-config.dto';

type FiscalServiceConfig = {
  id?: string;
  client_id?: string;
  cnpj_emitente?: string;
  ambiente?: 'homologacao' | 'producao';
  razao_social?: string;
  nome_fantasia?: string | null;
  inscricao_estadual?: string;
  telefone?: string | null;
  email?: string | null;
  address_logradouro?: string;
  address_numero?: string;
  address_complemento?: string | null;
  address_bairro?: string;
  address_municipio?: string;
  address_uf?: string;
  address_cep?: string;
  address_codigo_municipio?: string;
  serie_nfce?: number;
  serie_nfe?: number;
  csc_configured?: boolean;
  csc_id?: string | null;
  regime_fiscal?: string;
  cfop_padrao_nfce?: string | null;
  cfop_padrao_nfe?: string | null;
  icms_origem_padrao?: number | null;
  icms_cst_padrao?: string | null;
  icms_aliquota_padrao?: number | null;
  pis_cst_padrao?: string | null;
  pis_aliquota_padrao?: number | null;
  cofins_cst_padrao?: string | null;
  cofins_aliquota_padrao?: number | null;
};

@Injectable()
export class FiscalConfigService {
  private readonly logger = new Logger(FiscalConfigService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly fiscalToken: FiscalTokenService
  ) {}

  private fiscalHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'X-Caller-Service': 'bff-platform'
    };
  }

  private mapConfig(raw: FiscalServiceConfig): FiscalConfigResponse {
    return {
      id: raw.id ?? raw.cnpj_emitente ?? '',
      clientId: raw.client_id ?? '',
      cnpjEmitente: raw.cnpj_emitente ?? '',
      ambiente: raw.ambiente ?? 'homologacao',
      razaoSocial: raw.razao_social ?? '',
      nomeFantasia: raw.nome_fantasia ?? null,
      inscricaoEstadual: raw.inscricao_estadual ?? '',
      telefone: raw.telefone ?? null,
      email: raw.email ?? null,
      logradouro: raw.address_logradouro ?? '',
      numero: raw.address_numero ?? '',
      complemento: raw.address_complemento ?? null,
      bairro: raw.address_bairro ?? '',
      municipio: raw.address_municipio ?? '',
      uf: raw.address_uf ?? '',
      cep: raw.address_cep ?? '',
      codigoMunicipio: raw.address_codigo_municipio ?? '',
      serieNfce: raw.serie_nfce ?? 1,
      serieNfe: raw.serie_nfe ?? 1,
      cscConfigured: raw.csc_configured ?? false,
      cscId: raw.csc_id ?? null,
      regimeFiscal: raw.regime_fiscal ?? 'simples',
      cfopPadraoNfce: raw.cfop_padrao_nfce ?? null,
      cfopPadraoNfe: raw.cfop_padrao_nfe ?? null,
      icmsOrigemPadrao: raw.icms_origem_padrao ?? null,
      icmsCstPadrao: raw.icms_cst_padrao ?? null,
      icmsAliquotaPadrao: raw.icms_aliquota_padrao ?? null,
      pisCstPadrao: raw.pis_cst_padrao ?? null,
      pisAliquotaPadrao: raw.pis_aliquota_padrao ?? null,
      cofinsCstPadrao: raw.cofins_cst_padrao ?? null,
      cofinsAliquotaPadrao: raw.cofins_aliquota_padrao ?? null
    };
  }

  async listConfigs(clientId: string): Promise<FiscalConfigResponse[]> {
    const token = await this.fiscalToken.mint(clientId);
    const url = `${this.config.fiscalServiceUrl}/api/v1/config`;
    const response = await fetch(url, {
      headers: this.fiscalHeaders(token),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      this.logger.warn('Fiscal config list failed', { status: response.status });
      return [];
    }
    const body = (await response.json()) as FiscalServiceConfig[];
    return body.map((config) => this.mapConfig(config));
  }

  async getConfig(cnpjEmitente: string, clientId: string): Promise<FiscalConfigResponse | null> {
    const token = await this.fiscalToken.mint(clientId);
    const url = `${this.config.fiscalServiceUrl}/api/v1/config?cnpj_emitente=${encodeURIComponent(cnpjEmitente)}`;
    const response = await fetch(url, {
      headers: this.fiscalHeaders(token),
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      this.logger.warn('Fiscal config GET failed', { status: response.status });
      return null;
    }
    return this.mapConfig((await response.json()) as FiscalServiceConfig);
  }

  async upsertConfig(dto: UpsertFiscalConfigDto, clientId: string): Promise<FiscalConfigResponse> {
    const token = await this.fiscalToken.mint(clientId);
    const body = {
      cnpj_emitente: dto.cnpjEmitente,
      ambiente: dto.ambiente,
      razao_social: dto.razaoSocial,
      ...(dto.nomeFantasia !== undefined && { nome_fantasia: dto.nomeFantasia }),
      inscricao_estadual: dto.inscricaoEstadual,
      ...(dto.telefone !== undefined && { telefone: dto.telefone }),
      ...(dto.email !== undefined && { email: dto.email }),
      address_logradouro: dto.logradouro,
      address_numero: dto.numero,
      ...(dto.complemento !== undefined && { address_complemento: dto.complemento }),
      address_bairro: dto.bairro,
      address_municipio: dto.municipio,
      address_uf: dto.uf,
      address_cep: dto.cep,
      address_codigo_municipio: dto.codigoMunicipio,
      ...(dto.serieNfce !== undefined && { serie_nfce: dto.serieNfce }),
      ...(dto.serieNfe !== undefined && { serie_nfe: dto.serieNfe }),
      ...(dto.csc !== undefined && { csc: dto.csc }),
      ...(dto.cscId !== undefined && { csc_id: dto.cscId }),
      ...(dto.regimeFiscal !== undefined && { regime_fiscal: dto.regimeFiscal }),
      ...(dto.cfopPadraoNfce !== undefined && { cfop_padrao_nfce: dto.cfopPadraoNfce }),
      ...(dto.cfopPadraoNfe !== undefined && { cfop_padrao_nfe: dto.cfopPadraoNfe }),
      ...(dto.icmsOrigemPadrao !== undefined && { icms_origem_padrao: dto.icmsOrigemPadrao }),
      ...(dto.icmsCstPadrao !== undefined && { icms_cst_padrao: dto.icmsCstPadrao }),
      ...(dto.icmsAliquotaPadrao !== undefined && { icms_aliquota_padrao: dto.icmsAliquotaPadrao }),
      ...(dto.pisCstPadrao !== undefined && { pis_cst_padrao: dto.pisCstPadrao }),
      ...(dto.pisAliquotaPadrao !== undefined && { pis_aliquota_padrao: dto.pisAliquotaPadrao }),
      ...(dto.cofinsCstPadrao !== undefined && { cofins_cst_padrao: dto.cofinsCstPadrao }),
      ...(dto.cofinsAliquotaPadrao !== undefined && { cofins_aliquota_padrao: dto.cofinsAliquotaPadrao })
    };

    const url = `${this.config.fiscalServiceUrl}/api/v1/config`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.fiscalHeaders(token) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.warn('Fiscal config upsert failed', { status: response.status, err });
      throw new Error(err || `Fiscal service error ${response.status}`);
    }

    return this.mapConfig((await response.json()) as FiscalServiceConfig);
  }

  async uploadCertificate(dto: UploadFiscalCertificateDto, clientId: string): Promise<unknown> {
    const token = await this.fiscalToken.mint(clientId);
    const url = `${this.config.fiscalServiceUrl}/api/v1/certificados`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.fiscalHeaders(token) },
      body: JSON.stringify({
        cnpj_emitente: dto.cnpjEmitente,
        ambiente: dto.ambiente,
        pfx_base64: dto.pfxBase64,
        pfx_password: dto.pfxPassword
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.warn('Fiscal certificate upload failed', { status: response.status, err });
      throw new Error(err || `Fiscal service error ${response.status}`);
    }

    return response.json();
  }
}
