import { Request } from 'express';

/**
 * Contexto minimo resolvido pelo `ComandaSessionGuard` a partir do JWT de
 * sessao (`JBOOT_COMANDA_SESSION_SECRET`). Analogo, na forma, ao
 * `PdvRequestContext` do lado staff — mas implementacao independente, sem
 * import cruzado (ver MODULE_CONTRACT.md, "Dois lados, dois modelos de
 * autenticacao").
 */
export interface ComandaSessionContext {
  clientId: string;
  customerId: string;
  comandaId: string;
  tableNumber: number;
}

export interface ComandaRequest extends Request {
  comandaContext: ComandaSessionContext;
}

export interface ComandaQrPayload {
  typ: 'comanda_table_qr';
  clientId: string;
  tableNumber: number;
  tokenVersion: number;
  iat: number;
}

export interface ComandaSessionPayload {
  typ: 'comanda_session';
  clientId: string;
  customerId: string;
  comandaId: string;
  tableNumber: number;
  iat: number;
  exp: number;
}
