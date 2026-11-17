import { Injectable } from '@nestjs/common';
import { PdvRequestContext } from '../../admin.types';
import { isComandaForgotten } from '../comanda-esquecida';
import { ComandaSalaoRepository } from './comanda-salao.repository';
import {
  ComandaSalaoComandaView,
  ComandaSalaoMesaState,
  ComandaSalaoMesaView,
  ComandaSalaoRawRow
} from './comanda-salao.types';

@Injectable()
export class ComandaSalaoService {
  constructor(private readonly repository: ComandaSalaoRepository) {}

  async getSalao(context: PdvRequestContext): Promise<ComandaSalaoMesaView[]> {
    const rows = await this.repository.findSalao(context.clientId);
    const byMesa = new Map<string, ComandaSalaoMesaView>();

    for (const row of rows) {
      const mesa = byMesa.get(row.mesaId) ?? this.emptyMesa(row);
      const comanda = this.toComandaView(row);
      if (comanda) {
        mesa.comandas.push(comanda);
      }
      byMesa.set(row.mesaId, mesa);
    }

    return [...byMesa.values()]
      .map((mesa) => ({
        ...mesa,
        comandasAbertas: mesa.comandas.length,
        totalMesa: this.sumTotal(mesa.comandas),
        state: this.deriveState(mesa)
      }))
      .sort((a, b) => a.tableNumber - b.tableNumber);
  }

  /**
   * Precedencia de estado, do mais acionavel ao menos. `item_pronto` vence
   * `conta_solicitada` porque comida pronta esfria em minutos enquanto a
   * conta solicitada tolera espera — decisao de produto reversivel, e o card
   * mostra os dois indicadores mesmo quando um deles nao e o estado dominante.
   *
   * `inativa` so vale para mesa sem comanda aberta: mesa materializada como
   * inativa pela migracao da Sprint 7 pode ter comanda viva de antes, e nesse
   * caso o estado real da operacao vence o cadastro.
   *
   * `pagamento_parcial` (Sprint 9) fica abaixo de `conta_solicitada`: as duas
   * envolvem dinheiro, mas conta solicitada tem alguem esperando agora.
   */
  private deriveState(mesa: ComandaSalaoMesaView): ComandaSalaoMesaState {
    if (mesa.comandas.length === 0) {
      return mesa.mesaStatus === 'inactive' ? 'inativa' : 'livre';
    }
    if (mesa.comandas.some((comanda) => comanda.itensProntos > 0)) {
      return 'item_pronto';
    }
    if (mesa.comandas.some((comanda) => comanda.closingRequestedAt)) {
      return 'conta_solicitada';
    }
    // Dinheiro parcialmente recebido com saldo em aberto: a mesa ja comecou a
    // pagar e alguem pode ir embora sem quitar o resto.
    if (mesa.comandas.some((comanda) => Number(comanda.pago) > 0)) {
      return 'pagamento_parcial';
    }
    if (mesa.comandas.some((comanda) => comanda.isForgotten)) {
      return 'esquecida';
    }
    return 'ocupada';
  }

  private emptyMesa(row: ComandaSalaoRawRow): ComandaSalaoMesaView {
    return {
      mesaId: row.mesaId,
      tableNumber: row.tableNumber,
      label: row.label,
      mesaStatus: row.mesaStatus,
      state: 'livre',
      comandasAbertas: 0,
      totalMesa: '0',
      comandas: []
    };
  }

  private toComandaView(row: ComandaSalaoRawRow): ComandaSalaoComandaView | null {
    if (!row.comandaId || !row.openedAt || !row.lastActivityAt) {
      return null;
    }
    return {
      comandaId: row.comandaId,
      customerName: row.customerName ?? 'Cliente',
      customerPhone: row.customerPhone,
      customerDocumentNumber: row.customerDocumentNumber,
      openedAt: row.openedAt,
      lastActivityAt: row.lastActivityAt,
      closingRequestedAt: row.closingRequestedAt,
      total: row.total,
      pago: Number(row.pago ?? '0').toFixed(2),
      saldo: Math.max(0, Number(row.total) - Number(row.pago ?? '0')).toFixed(2),
      itensPendentes: row.itensPendentes,
      itensEmProducao: row.itensEmProducao,
      itensProntos: row.itensProntos,
      isForgotten: isComandaForgotten({
        closingRequestedAt: row.closingRequestedAt,
        lastActivityAt: row.lastActivityAt
      })
    };
  }

  private sumTotal(comandas: ComandaSalaoComandaView[]): string {
    const total = comandas.reduce((acc, comanda) => acc + Number(comanda.total), 0);
    return total.toFixed(2);
  }
}
