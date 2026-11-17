import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ComandaSessionContext } from '../comanda.types';
import { CreateComandaPedidoDto } from '../dto/create-pedido.dto';
import { ComandaProductsRepository } from '../repositories/comanda-products.repository';
import { ComandaItemInput, ComandaItemRow, ComandaPedidosRepository } from '../repositories/comanda-pedidos.repository';
import { ComandasRepository } from '../repositories/comandas.repository';

export interface ComandaItemView {
  id: string;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  queueType: 'cozinha' | 'bar';
  notes: string | null;
  status: ComandaItemRow['status'];
}

export interface ComandaMeView {
  clientId: string;
  comandaId: string;
  tableNumber: number;
  status: 'aberta' | 'fechada';
  pedidos: { id: string; submittedAt: string; itens: ComandaItemView[] }[];
  total: string;
}

@Injectable()
export class ComandaOrderService {
  constructor(
    private readonly comandas: ComandasRepository,
    private readonly pedidos: ComandaPedidosRepository,
    private readonly products: ComandaProductsRepository
  ) {}

  async getMe(context: ComandaSessionContext): Promise<ComandaMeView> {
    const comanda = await this.comandas.findById(context.clientId, context.comandaId);
    if (!comanda) {
      throw new NotFoundException('Comanda not found');
    }

    const [pedidosRows, itensRows] = await Promise.all([
      this.pedidos.findPedidosByComanda(context.comandaId),
      this.pedidos.findItensByComanda(context.comandaId)
    ]);

    const itensByPedido = new Map<string, ComandaItemView[]>();
    let total = 0;
    for (const item of itensRows) {
      const view = this.toItemView(item);
      const list = itensByPedido.get(item.comandaPedidoId) ?? [];
      list.push(view);
      itensByPedido.set(item.comandaPedidoId, list);
      if (item.status !== 'cancelado') {
        total += Number(item.unitPriceSnapshot) * Number(item.quantity);
      }
    }

    return {
      clientId: context.clientId,
      comandaId: comanda.id,
      tableNumber: comanda.tableNumber,
      status: comanda.status,
      pedidos: pedidosRows.map((pedido) => ({
        id: pedido.id,
        submittedAt: pedido.submittedAt,
        itens: itensByPedido.get(pedido.id) ?? []
      })),
      total: total.toFixed(2)
    };
  }

  /**
   * Preco/nome/queue_type resolvidos aqui, sempre a partir do catalogo —
   * nunca aceitos do `dto`. Item cujo produto nao existe/nao esta visivel
   * na comanda e silenciosamente descartado (nao falha o pedido inteiro) —
   * decisao de design registrada no relatorio da sprint.
   */
  async createPedido(
    context: ComandaSessionContext,
    dto: CreateComandaPedidoDto,
    idempotencyKey?: string
  ): Promise<{ pedidoId: string; submittedAt: string; itens: ComandaItemView[] }> {
    let claimId: string | null = null;
    if (idempotencyKey) {
      claimId = await this.pedidos.claimIdempotencyKey(context.comandaId, idempotencyKey);
      if (!claimId) {
        const existingPedidoId = await this.pedidos.findPedidoIdByIdempotencyKey(context.comandaId, idempotencyKey);
        if (existingPedidoId) {
          return this.loadPedidoResult(existingPedidoId, context.comandaId);
        }
        // Chave reivindicada por outra requisicao ainda em voo (corrida rara
        // entre retries quase simultaneos) — segue sem idempotencia nesta
        // chamada em vez de bloquear o cliente. Ver nota no relatorio.
      }
    }

    const requestedProductIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.products.findVisibleByIds(context.clientId, requestedProductIds);
    const productById = new Map(products.map((product) => [product.id, product]));

    const validItems: ComandaItemInput[] = [];
    for (const item of dto.items) {
      const product = productById.get(item.productId);
      if (!product || !product.queueType) {
        continue;
      }
      validItems.push({
        productId: product.id,
        productNameSnapshot: product.name,
        unitPriceSnapshot: product.price,
        quantity: item.quantity,
        queueType: product.queueType,
        notes: item.notes ?? null
      });
    }

    if (validItems.length === 0) {
      throw new UnprocessableEntityException('No valid items to order');
    }

    const { pedido, itens } = await this.pedidos.createPedidoWithItems(context.clientId, context.comandaId, validItems);

    if (claimId) {
      await this.pedidos.attachPedidoToIdempotencyClaim(claimId, pedido.id);
    }

    await this.comandas.touchLastActivity(context.comandaId);

    return { pedidoId: pedido.id, submittedAt: pedido.submittedAt, itens: itens.map((item) => this.toItemView(item)) };
  }

  async cancelItem(context: ComandaSessionContext, itemId: string): Promise<ComandaItemView> {
    const item = await this.pedidos.findItemById(context.comandaId, itemId);
    if (!item) {
      throw new NotFoundException('Item not found in this comanda');
    }
    if (item.status !== 'pendente') {
      throw new ConflictException('Item can only be cancelled while pendente');
    }

    const cancelled = await this.pedidos.cancelItemByClient(itemId);
    await this.comandas.touchLastActivity(context.comandaId);
    return this.toItemView(cancelled);
  }

  async requestClosing(context: ComandaSessionContext): Promise<{ status: string; closingRequestedAt: string | null }> {
    await this.comandas.requestClosing(context.comandaId);
    const comanda = await this.comandas.findById(context.clientId, context.comandaId);
    if (!comanda) {
      throw new NotFoundException('Comanda not found');
    }
    return { status: comanda.status, closingRequestedAt: comanda.closingRequestedAt };
  }

  private async loadPedidoResult(
    pedidoId: string,
    comandaId: string
  ): Promise<{ pedidoId: string; submittedAt: string; itens: ComandaItemView[] }> {
    const [pedidosRows, itensRows] = await Promise.all([
      this.pedidos.findPedidosByComanda(comandaId),
      this.pedidos.findItensByComanda(comandaId)
    ]);
    const pedido = pedidosRows.find((row) => row.id === pedidoId);
    if (!pedido) {
      throw new NotFoundException('Pedido not found');
    }
    const itens = itensRows.filter((item) => item.comandaPedidoId === pedidoId).map((item) => this.toItemView(item));
    return { pedidoId: pedido.id, submittedAt: pedido.submittedAt, itens };
  }

  private toItemView(item: ComandaItemRow): ComandaItemView {
    return {
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      unitPrice: item.unitPriceSnapshot,
      quantity: item.quantity,
      queueType: item.queueType,
      notes: item.notes,
      status: item.status
    };
  }
}
