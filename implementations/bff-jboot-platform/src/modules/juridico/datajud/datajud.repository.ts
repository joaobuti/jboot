import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export type DataJudAuditStatus =
  | 'success'
  | 'not_found'
  | 'restricted'
  | 'invalid'
  | 'rate_limited'
  | 'timeout'
  | 'provider_unavailable'
  | 'internal_error';

export interface DataJudAuditInput {
  identityId: string;
  requestId: string;
  tribunal: string | null;
  processNumberHmac: string;
  hmacKeyVersion: number;
  resultStatus: DataJudAuditStatus;
  providerLatencyMs: number;
  providerUpdatedAt: string | null;
}

export interface ManualSnapshotMovementInput {
  fingerprint: string;
  occurredAt: string | null;
  description: string;
}

export interface ManualSnapshotInput {
  processNumberCiphertext: Buffer;
  encryptionKeyVersion: number;
  processNumberHmac: string;
  hmacKeyVersion: number;
  tribunal: string;
  processFingerprint: string;
  providerUpdatedAt: string | null;
  datajudId: string | null;
  grau: string | null;
  dataAjuizamento: string | null;
  sincronizadoEm: string | null;
  classe: unknown;
  formato: unknown;
  sistema: unknown;
  orgaoJulgador: unknown;
  assuntos: unknown;
  retentionDays: number;
  movements: ManualSnapshotMovementInput[];
}

export interface ManualSnapshotRow {
  id: string;
  tribunal: string;
  processNumberCiphertext: Buffer;
  processFingerprint: string;
  providerUpdatedAt: string | null;
  capturedAt: string;
  datajudId: string | null;
  grau: string | null;
  dataAjuizamento: string | null;
  sincronizadoEm: string | null;
  classe: unknown;
  formato: unknown;
  sistema: unknown;
  orgaoJulgador: unknown;
  assuntos: unknown;
}

const MANUAL_SNAPSHOT_SELECT = `id,
          tribunal,
          process_number_ciphertext AS "processNumberCiphertext",
          process_fingerprint AS "processFingerprint",
          provider_updated_at AS "providerUpdatedAt",
          captured_at AS "capturedAt",
          datajud_id AS "datajudId",
          grau,
          data_ajuizamento AS "dataAjuizamento",
          sincronizado_em AS "sincronizadoEm",
          classe,
          formato,
          sistema,
          orgao_julgador AS "orgaoJulgador",
          assuntos`;

@Injectable()
export class DataJudRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Um unico snapshot vivo por processo consultado manualmente. Cada consulta
   * atualiza a capa e acumula movimentacoes novas: o conjunto de fingerprints
   * acumulado e o baseline que a Sprint 7 usa para dizer o que mudou.
   */
  async upsertManualSnapshot(
    clientId: string,
    databaseRef: string,
    input: ManualSnapshotInput,
  ): Promise<{ snapshotId: string; newMovements: ManualSnapshotMovementInput[] }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (db) => {
      const snapshot = await db.query<{ id: string }>(
        `INSERT INTO juridico_data_process_snapshots
           (client_id, origin, monitor_id, monitor_run_id, tribunal, provider_updated_at,
            process_fingerprint, process_number_ciphertext, encryption_key_version,
            process_number_hmac, hmac_key_version, datajud_id, grau, data_ajuizamento,
            sincronizado_em, classe, formato, sistema, orgao_julgador, assuntos, purge_after)
         VALUES ($1, 'manual_query', NULL, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
                 now() + ($18 || ' days')::interval)
         ON CONFLICT (client_id, process_number_hmac) WHERE origin = 'manual_query'
         DO UPDATE SET
           tribunal = EXCLUDED.tribunal,
           provider_updated_at = EXCLUDED.provider_updated_at,
           process_fingerprint = EXCLUDED.process_fingerprint,
           process_number_ciphertext = EXCLUDED.process_number_ciphertext,
           encryption_key_version = EXCLUDED.encryption_key_version,
           datajud_id = EXCLUDED.datajud_id,
           grau = EXCLUDED.grau,
           data_ajuizamento = EXCLUDED.data_ajuizamento,
           sincronizado_em = EXCLUDED.sincronizado_em,
           classe = EXCLUDED.classe,
           formato = EXCLUDED.formato,
           sistema = EXCLUDED.sistema,
           orgao_julgador = EXCLUDED.orgao_julgador,
           assuntos = EXCLUDED.assuntos,
           captured_at = now(),
           updated_at = now(),
           purge_after = EXCLUDED.purge_after
         RETURNING id`,
        [
          clientId,
          input.tribunal,
          input.providerUpdatedAt,
          input.processFingerprint,
          input.processNumberCiphertext,
          input.encryptionKeyVersion,
          input.processNumberHmac,
          input.hmacKeyVersion,
          input.datajudId,
          input.grau,
          input.dataAjuizamento,
          input.sincronizadoEm,
          JSON.stringify(input.classe ?? null),
          JSON.stringify(input.formato ?? null),
          JSON.stringify(input.sistema ?? null),
          JSON.stringify(input.orgaoJulgador ?? null),
          JSON.stringify(input.assuntos ?? []),
          String(input.retentionDays),
        ],
      );
      const snapshotId = snapshot.rows[0]!.id;
      const newMovements: ManualSnapshotMovementInput[] = [];
      for (const movement of input.movements) {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO juridico_data_snapshot_movements
             (client_id, snapshot_id, movement_fingerprint, occurred_at, description)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (client_id, snapshot_id, movement_fingerprint) DO NOTHING
           RETURNING id`,
          [clientId, snapshotId, movement.fingerprint, movement.occurredAt, movement.description],
        );
        if (inserted.rows[0]) newMovements.push(movement);
      }
      return { snapshotId, newMovements };
    });
  }

  /**
   * Quais dos processos informados ja foram exportados para o Flow.
   *
   * `juridico_data_flow_exports` e escrita por `domain-integrations`, mas vive
   * no banco do juridico e e lida aqui porque o modulo de integracao importa o
   * juridico, nunca o contrario — inverter criaria ciclo de modulo.
   */
  async findExportedByProcessHmac(
    clientId: string,
    databaseRef: string,
    hmacs: string[],
  ): Promise<Map<string, { boardId: string; cardId: string }>> {
    if (hmacs.length === 0) return new Map();
    const result = await this.database.queryForDatabaseRef<{
      processNumberHmac: string;
      boardId: string;
      cardId: string;
    }>(
      databaseRef,
      `SELECT DISTINCT ON (process_number_hmac)
              process_number_hmac AS "processNumberHmac",
              board_id AS "boardId",
              card_id AS "cardId"
       FROM juridico_data_flow_exports
       WHERE client_id = $1 AND process_number_hmac = ANY($2::bpchar[])
       ORDER BY process_number_hmac, updated_at DESC`,
      [clientId, hmacs],
    );
    return new Map(result.rows.map((row) => [row.processNumberHmac, { boardId: row.boardId, cardId: row.cardId }]));
  }

  /** Snapshots de consulta manual ja gravados para os processos informados. */
  async findSnapshotsByProcessHmac(
    clientId: string,
    databaseRef: string,
    hmacs: string[],
  ): Promise<Map<string, { snapshotId: string; capturedAt: string }>> {
    if (hmacs.length === 0) return new Map();
    const result = await this.database.queryForDatabaseRef<{
      processNumberHmac: string;
      snapshotId: string;
      capturedAt: string;
    }>(
      databaseRef,
      `SELECT process_number_hmac AS "processNumberHmac",
              id AS "snapshotId",
              captured_at AS "capturedAt"
       FROM juridico_data_process_snapshots
       WHERE client_id = $1 AND origin = 'manual_query' AND process_number_hmac = ANY($2::bpchar[])`,
      [clientId, hmacs],
    );
    return new Map(
      result.rows.map((row) => [row.processNumberHmac, { snapshotId: row.snapshotId, capturedAt: row.capturedAt }]),
    );
  }

  async getManualSnapshot(
    clientId: string,
    databaseRef: string,
    snapshotId: string,
  ): Promise<ManualSnapshotRow | null> {
    const result = await this.database.queryForDatabaseRef<ManualSnapshotRow>(
      databaseRef,
      `SELECT ${MANUAL_SNAPSHOT_SELECT}
       FROM juridico_data_process_snapshots
       WHERE client_id = $1 AND id = $2 AND origin = 'manual_query'`,
      [clientId, snapshotId],
    );
    return result.rows[0] ?? null;
  }

  async listSnapshotMovements(
    clientId: string,
    databaseRef: string,
    snapshotId: string,
  ): Promise<Array<{ occurredAt: string | null; description: string }>> {
    const result = await this.database.queryForDatabaseRef<{
      occurredAt: string | null;
      description: string;
    }>(
      databaseRef,
      `SELECT occurred_at AS "occurredAt", description
       FROM juridico_data_snapshot_movements
       WHERE client_id = $1 AND snapshot_id = $2
       ORDER BY occurred_at DESC NULLS LAST, created_at DESC`,
      [clientId, snapshotId],
    );
    return result.rows;
  }

  /** Snapshots de consulta manual vencidos. Monitores tem purga propria. */
  async purgeExpiredManualSnapshots(databaseRef: string): Promise<number> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `DELETE FROM juridico_data_process_snapshots
       WHERE origin = 'manual_query' AND purge_after IS NOT NULL AND purge_after <= now()`,
    );
    return result.rowCount ?? 0;
  }

  async insertAudit(clientId: string, databaseRef: string, input: DataJudAuditInput): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_data_query_audit
         (client_id, identity_id, request_id, provider, tribunal, process_number_hmac,
          hmac_key_version, result_status, provider_latency_ms, provider_updated_at)
       VALUES ($1, $2, $3, 'datajud', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_id, request_id) DO NOTHING`,
      [
        clientId,
        input.identityId,
        input.requestId,
        input.tribunal,
        input.processNumberHmac,
        input.hmacKeyVersion,
        input.resultStatus,
        input.providerLatencyMs,
        input.providerUpdatedAt,
      ],
    );
  }
}
