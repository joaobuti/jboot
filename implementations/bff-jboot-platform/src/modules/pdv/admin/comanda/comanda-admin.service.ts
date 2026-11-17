import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MutateContext, PdvRequestContext } from '../admin.types';
import { PdvAuditService } from '../../../shared/pdv-audit/pdv-audit.service';
import { SalesService } from '../sales/sales.service';
import { ComandaAdminRepository } from './comanda-admin.repository';
import { ComandaAdminItemRow, ComandaAdminQueueType, ComandaSummaryRow } from './comanda-admin.types';
import { isComandaForgotten } from './comanda-esquecida';
import { ComandaPaymentMethod } from './dto/comanda-admin.dto';

export interface ComandaListViewItem extends ComandaSummaryRow {
  isForgotten: boolean;
}

export interface ComandaPagamentoView {
  saleId: string;
  saleNumber: number;
  paymentMethod: string;
  amount: string;
  receivedAt: string;
}

export interface ComandaSaldoView {
  total: string;
  pago: string;
  saldo: string;
  pagamentos: ComandaPagamentoView[];
}

export interface ComandaDetailView {
  comanda: ComandaSummaryRow;
  itens: ComandaAdminItemRow[];
  saldo: ComandaSaldoView;
}

/**
 * Tolerancia de centavo na comparacao de saldo. Totais vem do banco como
 * `numeric` serializado em string e sao somados em ponto flutuante aqui;
 * sem a folga, uma conta quitada exatamente pode sobrar com saldo residual
 * de 0,0000001 e nunca fechar.
 */
const SALDO_EPSILON = 0.005;

@Injectable()
export class ComandaAdminService {
  constructor(
    private readonly repository: ComandaAdminRepository,
    private readonly audit: PdvAuditService,
    private readonly sales: SalesService
  ) {}

  listPendentes(context: PdvRequestContext): Promise<ComandaAdminItemRow[]> {
    return this.repository.findPendentes(context.clientId);
  }

  async listFila(context: PdvRequestContext, queueType: ComandaAdminQueueType): Promise<ComandaAdminItemRow[]> {
    this.assertScopeForQueue(context, queueType);
    return this.repository.findFila(context.clientId, queueType);
  }

  listProntos(context: PdvRequestContext): Promise<ComandaAdminItemRow[]> {
    return this.repository.findProntos(context.clientId);
  }

  async encaminhar(context: MutateContext, itemId: string): Promise<ComandaAdminItemRow> {
    const item = await this.getItemOrThrow(context.clientId, itemId);
    if (item.status !== 'pendente') {
      throw new ConflictException('Item must be pendente to be encaminhado');
    }

    await this.repository.markEmProducao(context.clientId, itemId, context.identityId);
    await this.audit.record('pdv_comanda_item_encaminhado', context, { itemId, comandaId: item.comandaId });

    return {
      ...item,
      status: 'em_producao',
      encaminhadoPor: context.identityId,
      encaminhadoAt: new Date().toISOString()
    };
  }

  async finalizar(context: MutateContext, itemId: string): Promise<ComandaAdminItemRow> {
    const item = await this.getItemOrThrow(context.clientId, itemId);
    // Escopo checado contra o queue_type real do item (nao vem por query
    // param neste endpoint) — quem so tem pdv:comanda:bar nao pode finalizar
    // um item de queue_type='cozinha', mesmo sabendo o id.
    this.assertScopeForQueue(context, item.queueType);
    if (item.status !== 'em_producao') {
      throw new ConflictException('Item must be em_producao to be finalizado');
    }

    await this.repository.markPronto(context.clientId, itemId, context.identityId);
    await this.audit.record('pdv_comanda_item_finalizado', context, { itemId, comandaId: item.comandaId });

    return {
      ...item,
      status: 'pronto',
      finalizadoPor: context.identityId,
      finalizadoAt: new Date().toISOString()
    };
  }

  async liberar(context: MutateContext, itemId: string): Promise<ComandaAdminItemRow> {
    const item = await this.getItemOrThrow(context.clientId, itemId);
    if (item.status !== 'pronto') {
      throw new ConflictException('Item must be pronto to be liberado');
    }

    await this.repository.markLiberado(context.clientId, itemId, context.identityId);
    await this.audit.record('pdv_comanda_item_liberado', context, { itemId, comandaId: item.comandaId });

    return {
      ...item,
      status: 'liberado_para_entrega',
      liberadoPor: context.identityId,
      liberadoAt: new Date().toISOString()
    };
  }

  async cancelar(context: MutateContext, itemId: string, reason?: string): Promise<ComandaAdminItemRow> {
    const item = await this.getItemOrThrow(context.clientId, itemId);
    if (item.status === 'cancelado') {
      throw new ConflictException('Item already cancelled');
    }

    const isException = item.status !== 'pendente';
    const trimmedReason = reason?.trim() || undefined;
    if (isException && !trimmedReason) {
      throw new UnprocessableEntityException('cancel_reason is required to cancel an item beyond pendente');
    }

    const finalReason = isException ? trimmedReason! : null;
    await this.repository.markCancelado(context.clientId, itemId, context.identityId, finalReason, isException);
    await this.audit.record('pdv_comanda_item_cancelado', context, { itemId, comandaId: item.comandaId, isException });

    return {
      ...item,
      status: 'cancelado',
      canceladoPor: context.identityId,
      canceladoAt: new Date().toISOString(),
      cancelReason: finalReason,
      cancelIsException: isException
    };
  }

  /**
   * Comandas abertas para a visao do Operador de Balcao, com o flag
   * "esquecida" calculado aqui (nao persistido): sem solicitacao de
   * fechamento do cliente E sem atividade ha mais de 45min.
   */
  async listComandas(context: PdvRequestContext): Promise<ComandaListViewItem[]> {
    const rows = await this.repository.findComandasAbertas(context.clientId);
    return rows.map((row) => ({ ...row, isForgotten: isComandaForgotten(row) }));
  }

  async getComandaDetail(context: PdvRequestContext, comandaId: string): Promise<ComandaDetailView> {
    const comanda = await this.repository.findComandaSummary(context.clientId, comandaId);
    if (!comanda) {
      throw new NotFoundException('Comanda not found');
    }
    const raw = await this.repository.findRawById(context.clientId, comandaId);
    const itens = await this.repository.findAllItensByComanda(context.clientId, comandaId);
    const saldo = await this.buildSaldo(context, comanda.total, raw?.parentSaleId ?? null);
    return { comanda, itens, saldo };
  }

  /**
   * Sprint 9 — recebimento parcial ou final. Cada recebimento vira uma venda
   * derivada da venda-pai da comanda: e o que mantem a conferencia de caixa
   * correta, que soma `pdv_sale_payments` de vendas concluidas.
   *
   * A comanda continua aceitando pedidos depois de um pagamento parcial
   * (decisao de produto): quem pagou quitou um valor fixo, e o total pode
   * subir para quem ficou. Por isso a venda-pai nasce vazia e so recebe os
   * itens na quitacao.
   */
  async registrarPagamento(
    context: MutateContext,
    comandaId: string,
    amount: number,
    paymentMethod: ComandaPaymentMethod
  ): Promise<{ comanda: ComandaSummaryRow; saldo: ComandaSaldoView; fechada: boolean }> {
    const raw = await this.repository.findRawById(context.clientId, comandaId);
    if (!raw) {
      throw new NotFoundException('Comanda not found');
    }
    if (raw.status !== 'aberta') {
      throw new ConflictException('Comanda is not aberta');
    }

    const activeItens = await this.getActiveItens(context.clientId, comandaId);
    const total = this.sumItens(activeItens);

    let parentSaleId = raw.parentSaleId;
    if (!parentSaleId) {
      const parent = await this.sales.createComandaParent(context);
      parentSaleId = parent.id;
      await this.repository.setParentSale(context.clientId, comandaId, parentSaleId);
    }

    const pagoAntes = await this.sales.paidTotalForComandaParent(context, parentSaleId);
    const saldoAntes = total - pagoAntes;
    if (amount > saldoAntes + SALDO_EPSILON) {
      throw new UnprocessableEntityException(
        `Valor recebido (${amount.toFixed(2)}) maior que o saldo da comanda (${saldoAntes.toFixed(2)})`
      );
    }

    await this.sales.registerComandaPayment(context, parentSaleId, { paymentMethod, amount });
    await this.audit.record('pdv_comanda_pagamento_registrado', context, {
      comandaId,
      parentSaleId,
      amount,
      paymentMethod
    });

    const quitada = pagoAntes + amount + SALDO_EPSILON >= total;
    if (quitada) {
      await this.sales.completeComandaParent(
        context,
        parentSaleId,
        activeItens.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice)
        }))
      );
      await this.repository.markFechada(context.clientId, comandaId, context.identityId, parentSaleId);
      await this.audit.record('pdv_comanda_fechada', context, {
        comandaId,
        saleId: parentSaleId,
        total,
        dividida: true
      });
    }

    const comanda = await this.repository.findComandaSummary(context.clientId, comandaId);
    const saldo = await this.buildSaldo(context, comanda!.total, parentSaleId);
    return { comanda: comanda!, saldo, fechada: quitada };
  }

  /**
   * Fechamento (normal ou de comanda esquecida — mesmo caminho, ver
   * MODULE_CONTRACT.md do comanda) exige confirmacao explicita de
   * pagamento pelo Operador de Balcao. Orquestra SalesService in-process
   * (chamada de metodo, nao HTTP) — nao exige pdv:sales:write porque
   * ScopeGuard e camada HTTP, nao se aplica a chamada direta de service.
   */
  async fecharComanda(
    context: MutateContext,
    comandaId: string,
    paymentMethod: ComandaPaymentMethod
  ): Promise<{ comanda: ComandaSummaryRow; saleId: string }> {
    const raw = await this.repository.findRawById(context.clientId, comandaId);
    if (!raw) {
      throw new NotFoundException('Comanda not found');
    }
    if (raw.status !== 'aberta') {
      throw new ConflictException('Comanda is not aberta');
    }
    // Comanda que ja recebeu pagamento parcial vive no modelo venda-pai/filhas
    // (Sprint 9). Fechar por aqui criaria uma segunda venda com o total cheio
    // e cobraria de novo o que ja foi pago.
    if (raw.parentSaleId) {
      throw new ConflictException(
        'Comanda tem pagamento parcial registrado — use POST /pdv/comanda/:id/pagamentos para receber o saldo'
      );
    }

    const activeItens = await this.getActiveItens(context.clientId, comandaId);
    const total = this.sumItens(activeItens);

    const sale = await this.sales.createComandaSale(context);
    for (const item of activeItens) {
      await this.sales.addItem(context, sale.id, {
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice)
      });
    }
    await this.sales.addPayment(context, sale.id, { paymentMethod, amount: total });
    await this.sales.complete(context, sale.id, {});

    await this.repository.markFechada(context.clientId, comandaId, context.identityId, sale.id);
    await this.audit.record('pdv_comanda_fechada', context, { comandaId, saleId: sale.id, paymentMethod, total });

    const comanda = await this.repository.findComandaSummary(context.clientId, comandaId);
    return { comanda: comanda!, saleId: sale.id };
  }

  private async getActiveItens(clientId: string, comandaId: string): Promise<ComandaAdminItemRow[]> {
    const itens = await this.repository.findAllItensByComanda(clientId, comandaId);
    const activeItens = itens.filter((item) => item.status !== 'cancelado');
    if (activeItens.length === 0) {
      throw new UnprocessableEntityException('Comanda has no active items to close');
    }
    return activeItens;
  }

  private sumItens(itens: ComandaAdminItemRow[]): number {
    return itens.reduce((acc, item) => acc + Number(item.unitPrice) * Number(item.quantity), 0);
  }

  private async buildSaldo(
    context: PdvRequestContext,
    total: string,
    parentSaleId: string | null
  ): Promise<ComandaSaldoView> {
    if (!parentSaleId) {
      return { total, pago: '0.00', saldo: Number(total).toFixed(2), pagamentos: [] };
    }
    const rows = await this.sales.paymentsForComandaParent(context, parentSaleId);
    const pago = rows.reduce((acc, row) => acc + Number(row.amount), 0);
    return {
      total,
      pago: pago.toFixed(2),
      saldo: Math.max(0, Number(total) - pago).toFixed(2),
      pagamentos: rows.map((row) => ({
        saleId: row.saleId,
        saleNumber: row.saleNumber,
        paymentMethod: row.paymentMethod,
        amount: row.amount,
        receivedAt: row.receivedAt
      }))
    };
  }

  private async getItemOrThrow(clientId: string, itemId: string): Promise<ComandaAdminItemRow> {
    const item = await this.repository.findItemById(clientId, itemId);
    if (!item) {
      throw new NotFoundException('Comanda item not found');
    }
    return item;
  }

  /**
   * `@RequireScopes('pdv:comanda:cozinha', 'pdv:comanda:bar')` no controller
   * e OR-any-of — nao amarra escopo a queueType. Esta checagem extra garante
   * que staff de bar nao leia/finalize itens de cozinha e vice-versa.
   */
  private assertScopeForQueue(context: PdvRequestContext, queueType: ComandaAdminQueueType): void {
    const requiredScope = queueType === 'cozinha' ? 'pdv:comanda:cozinha' : 'pdv:comanda:bar';
    if (!context.scopes.includes(requiredScope)) {
      throw new ForbiddenException(`Missing scope ${requiredScope} for queueType ${queueType}`);
    }
  }
}
