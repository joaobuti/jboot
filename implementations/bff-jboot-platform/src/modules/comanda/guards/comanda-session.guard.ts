import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ComandaJwtService } from '../services/comanda-jwt.service';
import { ComandasRepository } from '../repositories/comandas.repository';
import { ComandaRequest } from '../comanda.types';

/**
 * Guard independente do lado cliente do `comanda` — nunca importa nem
 * estende `PdvAuthGuard` (ver MODULE_CONTRACT.md). Modelo hibrido: valida a
 * assinatura do JWT de sessao E rele `comandas.status` no banco a cada
 * request, para invalidar sessao no fechamento sem blocklist/Redis.
 */
@Injectable()
export class ComandaSessionGuard implements CanActivate {
  constructor(
    private readonly jwt: ComandaJwtService,
    private readonly comandas: ComandasRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ComandaRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing comanda session token');
    }

    const payload = await this.jwt.verifySessionToken(token);

    const status = await this.comandas.findStatusById(payload.comandaId);
    if (status !== 'aberta') {
      throw new UnauthorizedException('Comanda session is no longer active');
    }

    request.comandaContext = {
      clientId: payload.clientId,
      customerId: payload.customerId,
      comandaId: payload.comandaId,
      tableNumber: payload.tableNumber
    };

    return true;
  }

  private extractBearerToken(request: ComandaRequest): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim();
  }
}
