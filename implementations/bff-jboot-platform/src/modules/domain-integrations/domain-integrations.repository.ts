import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainApplicationSlug, ResolvedApplicationContext } from './domain-integration.types';

@Injectable()
export class DomainIntegrationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async resolveApplicationContext(
    identityId: string,
    clientId: string,
    applicationSlug: DomainApplicationSlug,
    requiredScopes: readonly string[]
  ): Promise<ResolvedApplicationContext | null> {
    const result = await this.database.queryIdentity<{
      applicationId: string;
      databaseRef: string;
      scopes: string[];
      roles: string[];
    }>(
      `SELECT a.id AS "applicationId",
              dr.id AS "databaseRef",
              e.scopes,
              e.roles
       FROM applications a
       JOIN client_applications ca
         ON ca.application_id = a.id
        AND ca.client_id = $2
        AND ca.status IN ('active', 'trial')
        AND ca.starts_at <= now()
        AND (ca.ends_at IS NULL OR ca.ends_at > now())
       JOIN entitlements e
         ON e.application_id = a.id
        AND e.client_id = ca.client_id
        AND e.identity_id = $1
        AND e.status = 'active'
       JOIN memberships m
         ON m.identity_id = e.identity_id
        AND m.client_id = e.client_id
        AND m.status = 'active'
       JOIN LATERAL (
          SELECT dr1.*
          FROM database_refs dr1
          WHERE dr1.application_id = a.id
            AND dr1.status = 'active'
            AND (dr1.client_id = ca.client_id OR dr1.client_id IS NULL)
          ORDER BY CASE WHEN dr1.client_id = ca.client_id THEN 0 ELSE 1 END
          LIMIT 1
       ) dr ON true
       WHERE a.slug = $3
         AND a.status = 'active'
       LIMIT 1`,
      [identityId, clientId, applicationSlug]
    );
    const row = result.rows[0];
    if (!row || requiredScopes.some((scope) => !row.scopes?.includes(scope))) {
      return null;
    }
    return {
      identityId,
      clientId,
      applicationId: row.applicationId,
      databaseRef: row.databaseRef,
      scopes: row.scopes ?? [],
      roles: row.roles ?? []
    };
  }

  /**
   * Vinculo processo -> card, gravado no banco do juridico. O card em si e copia
   * autossuficiente no banco do Flow; este registro existe para o caminho
   * inverso, usado pela notificacao de mudanca da Sprint 7.
   */
  async registerDataJudExport(
    juridicoDatabaseRef: string,
    input: {
      clientId: string;
      snapshotId: string;
      processNumberHmac: string;
      hmacKeyVersion: number;
      tribunal: string;
      boardId: string;
      cardId: string;
      flowDatabaseRef: string;
      exportedByIdentityId: string;
    }
  ): Promise<void> {
    await this.database.queryForDatabaseRef(
      juridicoDatabaseRef,
      `INSERT INTO juridico_data_flow_exports
         (client_id, snapshot_id, process_number_hmac, hmac_key_version, tribunal,
          board_id, card_id, flow_database_ref, exported_by_identity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_id, board_id, process_number_hmac)
       DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id,
                     card_id = EXCLUDED.card_id,
                     flow_database_ref = EXCLUDED.flow_database_ref,
                     tribunal = EXCLUDED.tribunal,
                     updated_at = now()`,
      [
        input.clientId,
        input.snapshotId,
        input.processNumberHmac,
        input.hmacKeyVersion,
        input.tribunal,
        input.boardId,
        input.cardId,
        input.flowDatabaseRef,
        input.exportedByIdentityId
      ]
    );
  }

  /** Liga/desliga o monitoramento de um processo ja exportado para o Flow. */
  async setExportMonitor(
    juridicoDatabaseRef: string,
    clientId: string,
    cardId: string,
    monitorId: string | null
  ): Promise<{ processNumberHmac: string; tribunal: string; snapshotId: string | null } | null> {
    const result = await this.database.queryForDatabaseRef<{
      processNumberHmac: string;
      tribunal: string;
      snapshotId: string | null;
    }>(
      juridicoDatabaseRef,
      `UPDATE juridico_data_flow_exports
       SET monitor_id = $3::uuid, updated_at = now()
       WHERE client_id = $1 AND card_id = $2
       RETURNING process_number_hmac AS "processNumberHmac", tribunal, snapshot_id AS "snapshotId"`,
      [clientId, cardId, monitorId]
    );
    return result.rows[0] ?? null;
  }

  async findExportByCard(
    juridicoDatabaseRef: string,
    clientId: string,
    cardId: string
  ): Promise<{
    id: string;
    monitorId: string | null;
    tribunal: string;
    snapshotId: string | null;
    boardId: string;
    flowDatabaseRef: string;
  } | null> {
    const result = await this.database.queryForDatabaseRef<{
      id: string;
      monitorId: string | null;
      tribunal: string;
      snapshotId: string | null;
      boardId: string;
      flowDatabaseRef: string;
    }>(
      juridicoDatabaseRef,
      `SELECT id, monitor_id AS "monitorId", tribunal,
              snapshot_id AS "snapshotId", board_id AS "boardId",
              flow_database_ref AS "flowDatabaseRef"
       FROM juridico_data_flow_exports
       WHERE client_id = $1 AND card_id = $2`,
      [clientId, cardId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Auditoria do export no lado juridico. O export e fronteira de divulgacao: o
   * dado processual passa a ser legivel por membros do board que podem nao ter
   * acesso ao modulo juridico.
   */
  async insertExportAudit(
    juridicoDatabaseRef: string,
    input: {
      clientId: string;
      identityId: string;
      eventType: string;
      operationKey: string;
      payload: Record<string, unknown>;
      ip: string | null;
    }
  ): Promise<void> {
    await this.database.queryForDatabaseRef(
      juridicoDatabaseRef,
      `INSERT INTO juridico_audit_events
         (client_id, identity_id, event_type, operation_key, payload, ip)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (client_id, event_type, operation_key)
       DO NOTHING`,
      [
        input.clientId,
        input.identityId,
        input.eventType,
        input.operationKey,
        JSON.stringify(input.payload),
        input.ip
      ]
    );
  }
}
