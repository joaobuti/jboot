import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ComandaJwtService } from '../../../../comanda/services/comanda-jwt.service';
import { PdvAuditService } from '../../../../shared/pdv-audit/pdv-audit.service';
import { MutateContext, PdvRequestContext } from '../../admin.types';
import { ComandaMesasRepository } from './comanda-mesas.repository';
import { ComandaMesaRow, ComandaMesaView } from './comanda-mesas.types';

@Injectable()
export class ComandaMesasService {
  constructor(
    private readonly repository: ComandaMesasRepository,
    private readonly jwt: ComandaJwtService,
    private readonly audit: PdvAuditService
  ) {}

  async list(context: PdvRequestContext): Promise<ComandaMesaView[]> {
    const rows = await this.repository.findAll(context.clientId);
    return Promise.all(rows.map((row) => this.withQrToken(context.clientId, row)));
  }

  async create(context: MutateContext, tableNumber: number, label?: string): Promise<ComandaMesaView> {
    const existing = await this.repository.findByTableNumber(context.clientId, tableNumber);
    if (existing) {
      throw new ConflictException(`Mesa ${tableNumber} ja cadastrada`);
    }

    const row = await this.repository.create(context.clientId, tableNumber, label?.trim() || null);
    await this.audit.record('pdv_comanda_mesa_criada', context, { mesaId: row.id, tableNumber });
    return this.withQrToken(context.clientId, row);
  }

  async updateLabel(context: MutateContext, id: string, label?: string): Promise<ComandaMesaView> {
    await this.getOrThrow(context.clientId, id);
    const row = await this.repository.updateLabel(context.clientId, id, label?.trim() || null);
    await this.audit.record('pdv_comanda_mesa_atualizada', context, { mesaId: id, label: row.label });
    return this.withQrToken(context.clientId, row);
  }

  /**
   * Inativacao e o unico caminho de "remocao": o QR impresso referencia a
   * mesa e comandas historicas apontam para ela via FK. Mesa com comanda
   * aberta nao pode ser inativada — o cliente ficaria com sessao valida numa
   * mesa que o sistema considera inexistente.
   */
  async updateStatus(context: MutateContext, id: string, status: 'active' | 'inactive'): Promise<ComandaMesaView> {
    const mesa = await this.getOrThrow(context.clientId, id);
    if (status === 'inactive') {
      const abertas = await this.repository.countComandasAbertas(context.clientId, mesa.tableNumber);
      if (abertas > 0) {
        throw new ConflictException(
          `Mesa ${mesa.tableNumber} tem ${abertas} comanda(s) aberta(s) — feche antes de inativar`
        );
      }
    }

    const row = await this.repository.updateStatus(context.clientId, id, status);
    await this.audit.record('pdv_comanda_mesa_status_alterado', context, { mesaId: id, status });
    return this.withQrToken(context.clientId, row);
  }

  /**
   * Revoga o QR impresso da mesa. Usado quando o adesivo e fotografado,
   * copiado ou vaza — o token antigo para de valer imediatamente porque
   * `ComandaSessionService` compara `tokenVersion` do payload com o da mesa.
   */
  async regenerateQr(context: MutateContext, id: string): Promise<ComandaMesaView> {
    await this.getOrThrow(context.clientId, id);
    const row = await this.repository.bumpTokenVersion(context.clientId, id);
    await this.audit.record('pdv_comanda_mesa_qr_revogado', context, {
      mesaId: id,
      tokenVersion: row.tokenVersion
    });
    return this.withQrToken(context.clientId, row);
  }

  /**
   * Mesa inativa nao recebe token: nao ha QR valido para imprimir, e emitir
   * um token que o guard vai recusar so gera adesivo morto.
   */
  private async withQrToken(clientId: string, row: ComandaMesaRow): Promise<ComandaMesaView> {
    if (row.status !== 'active') {
      return { ...row, qrToken: null };
    }
    const qrToken = await this.jwt.issueQrToken({
      clientId,
      tableNumber: row.tableNumber,
      tokenVersion: row.tokenVersion
    });
    return { ...row, qrToken };
  }

  private async getOrThrow(clientId: string, id: string): Promise<ComandaMesaRow> {
    const mesa = await this.repository.findById(clientId, id);
    if (!mesa) {
      throw new NotFoundException('Mesa not found');
    }
    return mesa;
  }
}
