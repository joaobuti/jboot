import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { AppConfigService } from '../../../config/app-config.service';
import { ComandaQrPayload, ComandaSessionPayload } from '../comanda.types';

const SESSION_TTL = '8h';

/**
 * Emissao/validacao dos dois segredos JWT do lado cliente do `comanda`.
 * Implementacao independente, nunca importa nem estende `PdvAuthGuard` ou
 * `IdentityJwtService` — ver MODULE_CONTRACT.md, "Dois lados, dois modelos
 * de autenticacao".
 */
@Injectable()
export class ComandaJwtService {
  private readonly qrSecret: Uint8Array;
  private readonly sessionSecret: Uint8Array;

  constructor(private readonly config: AppConfigService) {
    this.qrSecret = new TextEncoder().encode(this.config.comandaQrSecret);
    this.sessionSecret = new TextEncoder().encode(this.config.comandaSessionSecret);
  }

  /**
   * Emissao do QR de mesa (Sprint 7, cadastro administrativo). Sem
   * `setExpirationTime`: o QR e impresso e colado na mesa, nao pode expirar
   * por prazo — a revogacao e granular via `token_version`, comparado com o
   * valor atual da mesa em `verifyQrToken`/`ComandaSessionService`.
   *
   * Vive aqui, e nao no lado `pdv/admin` que expoe o endpoint, para que o
   * segredo `JBOOT_COMANDA_QR_SECRET` e o formato do payload tenham um dono
   * unico. `ComandaModule` exporta este service; o acoplamento proibido
   * entre `pdv/admin` e `comanda` e o de repositories (acesso a dado), nao o
   * do contrato do token.
   */
  async issueQrToken(params: { clientId: string; tableNumber: number; tokenVersion: number }): Promise<string> {
    return new SignJWT({
      typ: 'comanda_table_qr',
      clientId: params.clientId,
      tableNumber: params.tableNumber,
      tokenVersion: params.tokenVersion
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(this.qrSecret);
  }

  /**
   * QR de mesa nunca expira por tempo (impresso, sem prazo) — revogacao e
   * granular via `comanda_tables.token_version`, verificada pelo chamador
   * apos esta validacao de assinatura.
   */
  async verifyQrToken(token: string): Promise<ComandaQrPayload> {
    try {
      const { payload } = await jwtVerify(token, this.qrSecret);
      if (
        payload.typ !== 'comanda_table_qr' ||
        typeof payload.clientId !== 'string' ||
        typeof payload.tableNumber !== 'number' ||
        typeof payload.tokenVersion !== 'number'
      ) {
        throw new UnauthorizedException('Invalid table QR token');
      }
      return payload as unknown as ComandaQrPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid table QR token');
    }
  }

  async issueSessionToken(params: {
    clientId: string;
    customerId: string;
    comandaId: string;
    tableNumber: number;
  }): Promise<string> {
    return new SignJWT({
      typ: 'comanda_session',
      clientId: params.clientId,
      customerId: params.customerId,
      comandaId: params.comandaId,
      tableNumber: params.tableNumber
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(SESSION_TTL)
      .sign(this.sessionSecret);
  }

  async verifySessionToken(token: string): Promise<ComandaSessionPayload> {
    try {
      const { payload } = await jwtVerify(token, this.sessionSecret);
      if (
        payload.typ !== 'comanda_session' ||
        typeof payload.clientId !== 'string' ||
        typeof payload.customerId !== 'string' ||
        typeof payload.comandaId !== 'string' ||
        typeof payload.tableNumber !== 'number'
      ) {
        throw new UnauthorizedException('Invalid comanda session token');
      }
      return payload as unknown as ComandaSessionPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid comanda session token');
    }
  }
}
