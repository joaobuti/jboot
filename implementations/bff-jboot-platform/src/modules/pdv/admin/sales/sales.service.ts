import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PdvRequestContext } from '../admin.types';
import { CashierRepository } from '../cashier/cashier.repository';
import { ComandaAdminRepository } from '../comanda/comanda-admin.repository';
import { FiscalConfigResponse } from '../../../fiscal/fiscal-config.dto';
import { FiscalConfigService as PlatformFiscalConfigService } from '../../../fiscal/fiscal-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { CustomersService } from '../../../establishment-customers/customers.service';
import { AddSaleItemDto, AddSalePaymentDto, ApplyDiscountDto, CancelSaleDto, CompleteSaleDto, EmitNfDto, UpdateSaleItemDto } from './dto/sale.dto';
import { FiscalIntegrationService } from './fiscal-integration.service';
import { PaymentsIntegrationService } from './payments-integration.service';
import { SaleItemRow, SalePaymentRow, SaleRow, SalesRepository } from './sales.repository';

export interface SaleComandaCustomerSuggestion {
  comandaId: string;
  name: string;
  documentNumber: string | null;
  phone: string | null;
  address: {
    zip: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    ibgeCode: string;
  } | null;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly fiscal: FiscalIntegrationService,
    private readonly inventory: InventoryService,
    private readonly fiscalConfigService: PlatformFiscalConfigService,
    private readonly comandaAdmin: ComandaAdminRepository,
    private readonly customers: CustomersService,
    private readonly cashierRepository: CashierRepository,
    private readonly payments: PaymentsIntegrationService,
  ) {}

  async create(context: PdvRequestContext, dto: { cashierId?: string }) {
    return this.repository.create(context.clientId, context.identityId, dto.cashierId, context.locationId);
  }

  /**
   * Sprint 9 — venda-pai de uma comanda com pagamento dividido. Nasce vazia e
   * `open`: os itens so sao materializados na quitacao, porque a comanda
   * continua aceitando pedidos depois do primeiro pagamento parcial (decisao
   * de produto: quem pagou pagou um valor fixo, nao um percentual do total).
   */
  async createComandaParent(context: PdvRequestContext, cashierId?: string) {
    const resolvedCashierId = await this.resolveComandaCashierId(context, cashierId);
    return this.repository.create(context.clientId, context.identityId, resolvedCashierId, context.locationId, 'comanda_parent');
  }

  async createComandaSale(context: PdvRequestContext, cashierId?: string) {
    const resolvedCashierId = await this.resolveComandaCashierId(context, cashierId);
    return this.repository.create(context.clientId, context.identityId, resolvedCashierId, context.locationId);
  }

  /**
   * Recebimento derivado: venda propria, sem itens, ligada a venda-pai.
   * Completa direto pelo repository — `assertSaleReadyToComplete` exige itens,
   * e aqui a ausencia de item e o desenho, nao um erro. Nao movimenta estoque:
   * a baixa acontece uma unica vez, na venda-pai.
   */
  async registerComandaPayment(
    context: PdvRequestContext,
    parentSaleId: string,
    dto: AddSalePaymentDto,
    cashierId?: string
  ) {
    const parent = await this.repository.findById(context.clientId, parentSaleId);
    if (parent.saleRole !== 'comanda_parent') {
      throw new BadRequestException('Sale is not a comanda parent sale');
    }
    if (parent.status !== 'open') {
      throw new BadRequestException('Comanda parent sale is not open');
    }

    const resolvedCashierId = await this.resolveComandaCashierId(context, cashierId);
    const child = await this.repository.create(
      context.clientId,
      context.identityId,
      resolvedCashierId,
      context.locationId,
      'comanda_payment',
      parentSaleId
    );
    const payment = await this.repository.addPayment(context.clientId, child.id, dto);
    await this.repository.updateStatus(context.clientId, child.id, 'completed');
    return { sale: child, payment };
  }

  async paidTotalForComandaParent(context: PdvRequestContext, parentSaleId: string): Promise<number> {
    return this.repository.paidTotalByParent(context.clientId, parentSaleId);
  }

  async paymentsForComandaParent(context: PdvRequestContext, parentSaleId: string) {
    return this.repository.paymentsByParent(context.clientId, parentSaleId);
  }

  /**
   * Quitacao: materializa os itens consumidos na venda-pai e a conclui. O pai
   * nao recebe pagamento proprio — o dinheiro esta nas filhas, e duplicar aqui
   * faria a conferencia de caixa contar duas vezes. Por isso a validacao de
   * pagamento e feita contra a soma das filhas, e nao por
   * `assertSaleReadyToComplete`.
   */
  async completeComandaParent(
    context: PdvRequestContext,
    parentSaleId: string,
    items: AddSaleItemDto[]
  ) {
    const parent = await this.repository.findById(context.clientId, parentSaleId);
    if (parent.saleRole !== 'comanda_parent') {
      throw new BadRequestException('Sale is not a comanda parent sale');
    }
    if (parent.status !== 'open') throw new BadRequestException('Sale is not open');
    if (items.length === 0) throw new BadRequestException('Sale has no items');

    for (const item of items) {
      await this.repository.addItem(context.clientId, parentSaleId, item);
    }

    const withItems = await this.repository.findById(context.clientId, parentSaleId);
    const paid = await this.repository.paidTotalByParent(context.clientId, parentSaleId);
    if (paid + 0.005 < Number(withItems.total)) {
      throw new BadRequestException('Pagamento insuficiente para fechar a venda');
    }

    await this.repository.updateStatus(context.clientId, parentSaleId, 'completed');
    const saleItems = await this.repository.itemsBySale(context.clientId, parentSaleId);
    await this.inventory.registerSaleMovements(
      context.clientId,
      parentSaleId,
      saleItems,
      context.identityId,
      context.locationId
    );
    return this.findById(context, parentSaleId);
  }

  async list(context: PdvRequestContext, params: { limit: number; offset: number; status?: string }) {
    return this.repository.list(context.clientId, params);
  }

  async addItem(context: PdvRequestContext, saleId: string, dto: AddSaleItemDto) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    return this.repository.addItem(context.clientId, saleId, dto);
  }

  async removeItem(context: PdvRequestContext, saleId: string, itemId: string): Promise<void> {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    await this.repository.removeItem(context.clientId, saleId, itemId);
  }

  async updateItem(context: PdvRequestContext, saleId: string, itemId: string, dto: UpdateSaleItemDto) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    return this.repository.updateItem(context.clientId, saleId, itemId, dto.quantity);
  }

  async applyDiscount(context: PdvRequestContext, saleId: string, dto: ApplyDiscountDto) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    return this.repository.applyDiscount(context.clientId, saleId, this.resolveDiscountValue(Number(sale.subtotal), dto));
  }

  async addPayment(context: PdvRequestContext, saleId: string, dto: AddSalePaymentDto) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    if (dto.paymentMethod === 'pix') {
      throw new BadRequestException('PIX deve ser iniciado pelo fluxo integrado');
    }
    return this.repository.addPayment(context.clientId, saleId, dto);
  }

  async initiatePixPayment(context: PdvRequestContext, saleId: string, amount: number) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    const amountMinor = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || Math.abs(amount - amountMinor / 100) > 0.000001) {
      throw new BadRequestException('Valor PIX deve ter no maximo duas casas decimais');
    }
    const charge = await this.payments.createPixCharge({
      clientId: context.clientId,
      saleId,
      amountMinor,
      idempotencyKey: `pdv:${saleId}:pix:${amountMinor}`,
    });
    const payment = await this.repository.addPendingPixPayment(context.clientId, saleId, amountMinor / 100, charge.id);
    return { chargeId: charge.id, status: charge.status, checkoutUrl: charge.checkoutUrl, payment };
  }

  async verifyPixPayment(context: PdvRequestContext, saleId: string, chargeId: string) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');
    const charge = await this.payments.verifyCharge(context.clientId, chargeId);
    const payment = charge.status === 'received'
      ? await this.repository.confirmIntegratedPayment(context.clientId, saleId, chargeId)
      : null;
    return { chargeId: charge.id, status: charge.status, payment };
  }

  async complete(context: PdvRequestContext, saleId: string, dto: CompleteSaleDto) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'open') throw new BadRequestException('Sale is not open');

    const items = await this.repository.itemsBySale(context.clientId, saleId);
    const payments = await this.repository.paymentsBySale(context.clientId, saleId);
    this.assertSaleReadyToComplete(sale, items, payments);

    if (!dto.cnpjEmitente) {
      await this.repository.updateStatus(context.clientId, saleId, 'completed');
      await this.inventory.registerSaleMovements(context.clientId, saleId, items, context.identityId, context.locationId);
      return this.findById(context, saleId);
    }

    return this.completeWithFiscal(context, saleId, sale, items, payments, dto);
  }

  async emitNf(context: PdvRequestContext, saleId: string, dto: EmitNfDto) {
    const sale = await this.repository.findById(context.clientId, saleId);
    if (sale.status !== 'completed') throw new BadRequestException('Venda não concluída');
    if (sale.fiscalStatus === 'authorized') {
      throw new BadRequestException('Venda já possui documento fiscal autorizado');
    }

    const configs = await this.fiscalConfigService.listConfigs(context.clientId);
    const config = configs[0] ?? null;
    if (!config) {
      throw new UnprocessableEntityException(
        'Configuração fiscal do emitente não encontrada. Configure em Configurações → Fiscal.'
      );
    }

    const items = await this.repository.itemsBySale(context.clientId, saleId);
    const payments = await this.repository.paymentsBySale(context.clientId, saleId);
    this.assertFiscalItemsReady(items);
    const fiscalRequestId = this.resolveFiscalRequestId(sale);
    await this.repository.setFiscalStatus(context.clientId, saleId, 'pending', undefined, fiscalRequestId);

    const emitente = this.buildEmitente(config);
    const result = dto.nfType === 'nfe'
      ? await this.fiscal.emitirNfe({ requestId: fiscalRequestId, clientId: context.clientId, cnpjEmitente: config.cnpjEmitente, emitente, destinatario: dto.destinatario, items, payments, total: Number(sale.total) })
      : await this.fiscal.emitirNfce({ requestId: fiscalRequestId, clientId: context.clientId, cnpjEmitente: config.cnpjEmitente, emitente, cpfConsumidor: dto.cpfConsumidor, items, payments, total: Number(sale.total) });

    await this.repository.setFiscalStatus(context.clientId, saleId, result.status, result.fiscalDocumentId || undefined, fiscalRequestId);

    return {
      ...await this.findById(context, saleId),
      fiscal: { status: result.status, chaveAcesso: result.chaveAcesso, protocolo: result.protocolo, errorMessage: result.errorMessage }
    };
  }

  async cancel(context: PdvRequestContext, saleId: string, dto: CancelSaleDto = {}): Promise<void> {
    const sale = await this.repository.findById(context.clientId, saleId);
    const reason = dto.reason?.trim() || null;
    if (sale.status === 'open') {
      await this.repository.cancelSale(context.clientId, saleId, context.identityId, reason);
      return;
    }
    if (sale.status !== 'completed') {
      throw new BadRequestException('Sale is not open or completed');
    }
    if (sale.saleRole !== 'standalone') {
      throw new BadRequestException('Cancelamento de venda de comanda deve ser feito pelo fluxo de comanda');
    }
    if (!reason) {
      throw new BadRequestException('Motivo do estorno é obrigatório');
    }

    let fiscalCancelStatus: string | undefined;
    let fiscalCancelError: string | undefined;
    if (sale.fiscalDocumentId) {
      const result = await this.fiscal.cancelarDocumento({
        clientId: context.clientId,
        fiscalDocumentId: sale.fiscalDocumentId,
        justificativa: reason
      });
      fiscalCancelStatus = result.status;
      fiscalCancelError = result.errorMessage;
      if (result.status !== 'cancelled') {
        await this.repository.setFiscalCancelStatus(context.clientId, saleId, fiscalCancelStatus, fiscalCancelError);
        throw new UnprocessableEntityException(result.errorMessage ?? 'Cancelamento fiscal rejeitado');
      }
    }

    const items = await this.repository.itemsBySale(context.clientId, saleId);
    await this.inventory.registerSaleRefundMovements(context.clientId, saleId, items, context.identityId, context.locationId);
    await this.repository.cancelSale(context.clientId, saleId, context.identityId, reason, fiscalCancelStatus, fiscalCancelError);
  }

  /**
   * Sprint 6 (CPF-na-nota): se a venda veio do fechamento de uma comanda de
   * autoatendimento, sugere os dados do cliente final (ja capturados na
   * abertura da sessao) pra pre-preencher `destinatario` na tela de emissao
   * de NF. Nunca emite nada automaticamente — so retorna o dado pra o
   * operador confirmar/editar. `null` quando a venda nao veio de comanda
   * (caminho normal do PDV).
   */
  async getComandaCustomerSuggestion(
    context: PdvRequestContext,
    saleId: string
  ): Promise<SaleComandaCustomerSuggestion | null> {
    await this.repository.findById(context.clientId, saleId);

    const link = await this.comandaAdmin.findComandaCustomerLinkByClosedSaleId(context.clientId, saleId);
    if (!link) {
      return null;
    }

    const customer = await this.customers.findById(context.clientId, link.customerId);
    if (!customer) {
      return null;
    }

    const hasFullAddress = Boolean(
      customer.addressZip && customer.addressStreet && customer.addressNumber &&
      customer.addressNeighborhood && customer.addressCity && customer.addressState && customer.addressIbgeCode
    );

    return {
      comandaId: link.comandaId,
      name: customer.name,
      documentNumber: customer.documentNumber,
      phone: customer.phone,
      address: hasFullAddress
        ? {
            zip: customer.addressZip!,
            street: customer.addressStreet!,
            number: customer.addressNumber!,
            complement: customer.addressComplement,
            neighborhood: customer.addressNeighborhood!,
            city: customer.addressCity!,
            state: customer.addressState!,
            ibgeCode: customer.addressIbgeCode!
          }
        : null
    };
  }

  async findById(context: PdvRequestContext, saleId: string) {
    const sale = await this.repository.findById(context.clientId, saleId);
    const items = await this.repository.itemsBySale(context.clientId, saleId);
    const payments = await this.repository.paymentsBySale(context.clientId, saleId);
    return { ...sale, items, payments };
  }

  private assertSaleReadyToComplete(sale: SaleRow, items: SaleItemRow[], payments: SalePaymentRow[]): void {
    if (items.length === 0) throw new BadRequestException('Sale has no items');
    if (payments.length === 0) throw new BadRequestException('Sale has no payments');
    const confirmed = payments.filter((payment) => payment.status === 'confirmed');
    if (confirmed.length === 0) throw new BadRequestException('Sale has no confirmed payments');
    const paidTotal = confirmed.reduce((acc, p) => acc + Number(p.amount), 0);
    if (paidTotal < Number(sale.total)) {
      throw new BadRequestException('Pagamento insuficiente para fechar a venda');
    }
  }

  private async completeWithFiscal(
    context: PdvRequestContext,
    saleId: string,
    sale: SaleRow,
    items: SaleItemRow[],
    payments: SalePaymentRow[],
    dto: CompleteSaleDto
  ) {
    const fiscalRequestId = randomUUID();
    await this.repository.setFiscalStatus(context.clientId, saleId, 'pending', undefined, fiscalRequestId, { transitionSaleStatus: true });
    const result = await this.fiscal.emitirNfce({
      requestId: fiscalRequestId,
      clientId: context.clientId,
      cnpjEmitente: dto.cnpjEmitente!,
      emitente: dto.emitente!,
      items,
      payments,
      total: Number(sale.total)
    });
    await this.repository.setFiscalStatus(context.clientId, saleId, result.status, result.fiscalDocumentId || undefined, fiscalRequestId, { transitionSaleStatus: true });
    if (result.status === 'authorized') {
      await this.inventory.registerSaleMovements(context.clientId, saleId, items, context.identityId, context.locationId);
    }
    return this.findById(context, saleId);
  }

  private resolveDiscountValue(subtotal: number, dto: ApplyDiscountDto): number {
    let value: number;
    if (dto.discountType === 'percent') {
      if (dto.amount > 100) throw new BadRequestException('Percentual não pode exceder 100%');
      value = subtotal * dto.amount / 100;
    } else {
      value = dto.amount;
    }
    if (value > subtotal) throw new BadRequestException('Desconto não pode exceder o subtotal');
    return value;
  }

  private async resolveComandaCashierId(context: PdvRequestContext, cashierId?: string): Promise<string> {
    if (cashierId) return cashierId;
    const cashier = await this.cashierRepository.findOrOpenComandaFallback(
      context.clientId,
      context.identityId,
      context.locationId
    );
    return cashier.id;
  }

  private buildEmitente(config: FiscalConfigResponse) {
    return {
      cnpj: config.cnpjEmitente,
      razaoSocial: config.razaoSocial,
      nomeFantasia: config.nomeFantasia ?? undefined,
      ie: config.inscricaoEstadual,
      uf: config.uf,
      crt: config.regimeFiscal === 'simples' ? 1 : 3,
      endereco: {
        logradouro: config.logradouro,
        numero: config.numero,
        complemento: config.complemento ?? undefined,
        bairro: config.bairro,
        municipio: config.municipio,
        uf: config.uf,
        cep: config.cep,
        codigoMunicipio: config.codigoMunicipio,
        telefone: config.telefone ?? undefined
      }
    };
  }

  private resolveFiscalRequestId(sale: SaleRow): string {
    if (
      sale.fiscalRequestId &&
      ['pending', 'contingency', 'uncertain'].includes(sale.fiscalStatus ?? '')
    ) {
      return sale.fiscalRequestId;
    }
    return randomUUID();
  }

  private assertFiscalItemsReady(items: SaleItemRow[]): void {
    const invalid = items.find((item) => !/^\d{8}$/.test(item.ncm ?? ''));
    if (invalid) {
      throw new UnprocessableEntityException(
        `Produto ${invalid.description || invalid.productId} sem NCM fiscal válido`
      );
    }
  }
}
