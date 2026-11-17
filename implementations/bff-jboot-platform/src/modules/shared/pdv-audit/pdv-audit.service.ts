import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

/**
 * Contexto minimo exigido para registrar um evento de auditoria.
 * Definido localmente (em vez de importado de `pdv/admin/admin.types`) para
 * manter este modulo neutro e sem dependencia de volta para `pdv` — qualquer
 * tipo que satisfaca esta forma estruturalmente (ex.: `MutateContext` do
 * `pdv`) pode ser passado sem import cruzado.
 */
export interface PdvAuditContext {
  clientId: string;
  identityId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PdvAuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(eventType: string, context: PdvAuditContext, payload: Record<string, unknown>): Promise<void> {
    await this.database.query(
      `INSERT INTO pdv_audit_events (client_id, identity_id, event_type, payload, ip, user_agent)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        context.clientId,
        context.identityId,
        eventType,
        JSON.stringify(payload),
        context.ip ?? null,
        context.userAgent ?? null
      ]
    );
  }
}
