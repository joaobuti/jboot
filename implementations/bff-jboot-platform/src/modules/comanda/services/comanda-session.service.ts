import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { CustomersService } from '../../establishment-customers/customers.service';
import { ComandaSessionContext } from '../comanda.types';
import { CreateComandaSessionDto } from '../dto/create-session.dto';
import { ComandaTablesRepository } from '../repositories/comanda-tables.repository';
import { ComandasRepository } from '../repositories/comandas.repository';
import { ComandaJwtService } from './comanda-jwt.service';

export interface ComandaSessionResult {
  token: string;
  clientId: string;
  comandaId: string;
  tableNumber: number;
  status: 'aberta' | 'fechada';
}

@Injectable()
export class ComandaSessionService {
  constructor(
    private readonly jwt: ComandaJwtService,
    private readonly tables: ComandaTablesRepository,
    private readonly comandas: ComandasRepository,
    private readonly customers: CustomersService
  ) {}

  /**
   * Abre (ou retoma) a sessao publica do cliente. Comanda e sempre
   * individual por telefone/CPF — nunca compartilhada por mesa (ver
   * MODULE_CONTRACT.md).
   */
  async createSession(dto: CreateComandaSessionDto): Promise<ComandaSessionResult> {
    const qrPayload = await this.jwt.verifyQrToken(dto.qrToken);

    const table = await this.tables.findByClientAndTableNumber(qrPayload.clientId, qrPayload.tableNumber);
    if (!table || table.status !== 'active' || table.tokenVersion !== qrPayload.tokenVersion) {
      throw new UnauthorizedException('Table QR token is no longer valid');
    }

    if (!dto.phone && !dto.documentNumber) {
      throw new UnprocessableEntityException('Informe telefone ou CPF');
    }

    const customer = await this.customers.findOrCreatePublic(table.clientId, {
      documentNumber: dto.documentNumber ?? null,
      phone: dto.phone ?? null
    });

    const existing = await this.comandas.findOpenByCustomer(table.clientId, customer.id);
    const comanda = existing ?? (await this.comandas.create(table.clientId, customer.id, table.tableNumber));

    const token = await this.jwt.issueSessionToken({
      clientId: table.clientId,
      customerId: customer.id,
      comandaId: comanda.id,
      tableNumber: table.tableNumber
    });

    return { token, clientId: table.clientId, comandaId: comanda.id, tableNumber: table.tableNumber, status: comanda.status };
  }

  /**
   * Sliding expiration — reemite o token de sessao com nova `exp`. O guard
   * ja validou assinatura e `comandas.status='aberta'` antes de chegar
   * aqui, entao os claims do contexto atual continuam validos.
   */
  async refreshSession(context: ComandaSessionContext): Promise<{ token: string }> {
    const token = await this.jwt.issueSessionToken(context);
    return { token };
  }
}
