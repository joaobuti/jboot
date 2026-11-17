import { Injectable } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { ProcessSnapshotInput } from './process-fingerprint';
import {
  DjenCadenceDays,
  ProcessMonitorCadence,
  ProcessMonitorDestinationRef,
  ProcessMonitorSource,
  ProcessDetailsView,
  ProcessMonitorView,
  ProcessMonitoringProduct,
  ProcessMovementView,
  ProcessTimelineMovement
} from './process-monitoring.types';

/** Publicacao do DJEN pronta para gravar (texto ja cifrado). */
export interface NewProcessPublication {
  providerHash: string;
  communicationId: number | null;
  availableOn: string | null;
  communicationType: string | null;
  documentType: string | null;
  courtName: string | null;
  textCiphertext: Buffer | null;
  encryptionKeyVersion: number | null;
  link: string | null;
  /** Inicio do texto puro, so para a notificacao; nao e gravado. */
  excerpt: string;
}

export interface StoredProcessPublication {
  id: string;
  availableOn: string | null;
  communicationType: string | null;
  documentType: string | null;
  courtName: string | null;
  textCiphertext: Buffer | null;
  link: string | null;
  isNew: boolean;
}

export interface ProcessMonitorRunRow extends ProcessMonitorView {
  createdByIdentityId: string;
  processNumberCiphertext: Buffer;
}

export interface NewProcessMonitor {
  clientId: string;
  identityId: string;
  tribunal: string | null;
  ciphertext: Buffer;
  encryptionKeyVersion: number;
  hmac: string;
  hmacKeyVersion: number;
  cadence: ProcessMonitorCadence;
  nextCheckAt: Date;
  originProduct: ProcessMonitoringProduct;
  destinationProduct: ProcessMonitoringProduct;
  destinationRef: ProcessMonitorDestinationRef;
}

const COLUMNS = `
  id, tribunal, cadence, state,
  origin_product AS "originProduct", destination_product AS "destinationProduct", destination_ref AS "destinationRef",
  last_checked_at AS "lastCheckedAt", next_check_at AS "nextCheckAt", paused_at AS "pausedAt",
  created_at AS "createdAt", updated_at AS "updatedAt",
  (SELECT r.status FROM process_monitor_runs r
    WHERE r.client_id = process_monitors.client_id AND r.monitor_id = process_monitors.id AND r.source = 'datajud'
      AND r.status <> 'running'
    ORDER BY r.completed_at DESC NULLS LAST LIMIT 1) AS "lastRunStatus",
  datajud_enabled AS "datajudEnabled", djen_enabled AS "djenEnabled", djen_cadence_days AS "djenCadenceDays",
  djen_last_checked_at AS "djenLastCheckedAt", to_char(djen_next_check_on, 'YYYY-MM-DD') AS "djenNextCheckOn",
  (SELECT r.status FROM process_monitor_runs r
    WHERE r.client_id = process_monitors.client_id AND r.monitor_id = process_monitors.id AND r.source = 'djen'
      AND r.status <> 'running'
    ORDER BY r.completed_at DESC NULLS LAST LIMIT 1) AS "djenLastRunStatus"`;

/**
 * Banco exclusivo `jboot_process_monitoring` (ADR 021). Toda consulta filtra por `client_id`; o indice
 * unico `(client_id, process_number_hmac)` fora de `deleted` garante um acompanhamento por processo.
 */
@Injectable()
export class ProcessMonitoringRepository {
  constructor(private readonly database: DatabaseService, private readonly config: AppConfigService) {}

  async create(input: NewProcessMonitor): Promise<ProcessMonitorView> {
    const result = await this.query<ProcessMonitorView>(
      `INSERT INTO process_monitors
         (client_id, created_by_identity_id, tribunal, process_number_ciphertext, encryption_key_version,
          process_number_hmac, hmac_key_version, cadence, next_check_at, origin_product, destination_product, destination_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING ${COLUMNS}`,
      [
        input.clientId, input.identityId, input.tribunal, input.ciphertext, input.encryptionKeyVersion,
        input.hmac, input.hmacKeyVersion, input.cadence, input.nextCheckAt, input.originProduct,
        input.destinationProduct, JSON.stringify(input.destinationRef)
      ]
    );
    return result.rows[0]!;
  }

  /** Acompanhamento vivo (ativo ou pausado) do processo no cliente. */
  async findLiveByHmac(clientId: string, hmac: string): Promise<ProcessMonitorView | null> {
    const result = await this.query<ProcessMonitorView>(
      `SELECT ${COLUMNS} FROM process_monitors WHERE client_id = $1 AND process_number_hmac = $2 AND state <> 'deleted'`,
      [clientId, hmac]
    );
    return result.rows[0] ?? null;
  }

  /** Acompanhamento vivo cujo destino e o card (Flow). */
  async findByDestinationCard(clientId: string, databaseRef: string, cardId: string): Promise<ProcessMonitorView | null> {
    const result = await this.query<ProcessMonitorView>(
      `SELECT ${COLUMNS} FROM process_monitors
       WHERE client_id = $1 AND destination_product = 'flow' AND state <> 'deleted'
         AND destination_ref->>'databaseRef' = $2 AND destination_ref->>'cardId' = $3`,
      [clientId, databaseRef, cardId]
    );
    return result.rows[0] ?? null;
  }

  async find(clientId: string, id: string): Promise<ProcessMonitorView | null> {
    const result = await this.query<ProcessMonitorView>(
      `SELECT ${COLUMNS} FROM process_monitors WHERE client_id = $1 AND id = $2 AND state <> 'deleted'`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  async listByDestination(clientId: string, product: ProcessMonitoringProduct): Promise<ProcessMonitorView[]> {
    const result = await this.query<ProcessMonitorView>(
      `SELECT ${COLUMNS} FROM process_monitors
       WHERE client_id = $1 AND destination_product = $2 AND state <> 'deleted'
       ORDER BY created_at DESC LIMIT 100`,
      [clientId, product]
    );
    return result.rows;
  }

  /** Numero cifrado do acompanhamento fora de `deleted`, ativo ou pausado (busca sob demanda). */
  async findForLookup(clientId: string, id: string): Promise<ProcessMonitorRunRow | null> {
    const result = await this.query<ProcessMonitorRunRow>(
      `SELECT ${COLUMNS}, created_by_identity_id AS "createdByIdentityId", process_number_ciphertext AS "processNumberCiphertext"
       FROM process_monitors WHERE client_id = $1 AND id = $2 AND state <> 'deleted'`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  async findForRun(clientId: string, id: string): Promise<ProcessMonitorRunRow | null> {
    const result = await this.query<ProcessMonitorRunRow>(
      `SELECT ${COLUMNS}, created_by_identity_id AS "createdByIdentityId", process_number_ciphertext AS "processNumberCiphertext"
       FROM process_monitors WHERE client_id = $1 AND id = $2 AND state = 'active'`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  async setState(clientId: string, id: string, state: 'active' | 'paused', nextCheckAt: Date | null): Promise<ProcessMonitorView | null> {
    const result = await this.query<ProcessMonitorView>(
      `UPDATE process_monitors
       SET state = $3::varchar,
           next_check_at = CASE WHEN $3::varchar = 'paused' THEN NULL ELSE $4::timestamptz END,
           paused_at = CASE WHEN $3::varchar = 'paused' THEN now() ELSE NULL END,
           updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state <> 'deleted'
       RETURNING ${COLUMNS}`,
      [clientId, id, state, nextCheckAt]
    );
    return result.rows[0] ?? null;
  }

  async setCadence(clientId: string, id: string, cadence: ProcessMonitorCadence, nextCheckAt: Date): Promise<ProcessMonitorView | null> {
    const result = await this.query<ProcessMonitorView>(
      `UPDATE process_monitors
       SET cadence = $3, next_check_at = CASE WHEN state = 'active' THEN $4::timestamptz ELSE next_check_at END, updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state <> 'deleted'
       RETURNING ${COLUMNS}`,
      [clientId, id, cadence, nextCheckAt]
    );
    return result.rows[0] ?? null;
  }

  async markDeleted(clientId: string, id: string): Promise<boolean> {
    const result = await this.query(
      `UPDATE process_monitors
       SET state = 'deleted', deleted_at = now(), purge_after = now() + interval '180 days', next_check_at = NULL, updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state <> 'deleted'`,
      [clientId, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async beginRun(
    clientId: string,
    monitorId: string,
    idempotencyKey: string,
    workflowRunId: string,
    source: ProcessMonitorSource = 'datajud'
  ): Promise<{ id: string; alreadyProcessed: boolean }> {
    return this.transaction(async (db) => {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO process_monitor_runs (client_id, monitor_id, idempotency_key, workflow_run_id, status, source)
         VALUES ($1, $2, $3, $4, 'running', $5)
         ON CONFLICT (client_id, monitor_id, idempotency_key) DO NOTHING RETURNING id`,
        [clientId, monitorId, idempotencyKey, workflowRunId, source]
      );
      if (inserted.rows[0]) return { id: inserted.rows[0].id, alreadyProcessed: false };
      // Nova tentativa do Temporal reusa a chave: execucao que falhou volta a consultar; a que deu certo
      // (ou ainda esta rodando) continua idempotente.
      const retaken = await db.query<{ id: string }>(
        `UPDATE process_monitor_runs SET status = 'running', workflow_run_id = $4, provider_latency_ms = NULL,
                started_at = now(), completed_at = NULL
          WHERE client_id = $1 AND monitor_id = $2 AND idempotency_key = $3 AND status NOT IN ('running', 'success')
          RETURNING id`,
        [clientId, monitorId, idempotencyKey, workflowRunId]
      );
      if (retaken.rows[0]) return { id: retaken.rows[0].id, alreadyProcessed: false };
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM process_monitor_runs WHERE client_id = $1 AND monitor_id = $2 AND idempotency_key = $3`,
        [clientId, monitorId, idempotencyKey]
      );
      return { id: existing.rows[0]!.id, alreadyProcessed: true };
    });
  }

  async completeRun(clientId: string, input: { runId: string; monitorId: string; status: string; latencyMs: number; nextCheckAt: Date }): Promise<void> {
    await this.transaction(async (db) => {
      await db.query(
        `UPDATE process_monitor_runs SET status = $3, provider_latency_ms = $4, completed_at = now()
         WHERE id = $1 AND client_id = $2`,
        [input.runId, clientId, input.status, input.latencyMs]
      );
      await db.query(
        `UPDATE process_monitors SET last_checked_at = now(), next_check_at = $3::timestamptz, updated_at = now()
         WHERE id = $1 AND client_id = $2 AND state = 'active'`,
        [input.monitorId, clientId, input.nextCheckAt]
      );
    });
  }

  /**
   * Um retrato por acompanhamento, atualizado no lugar; movimentacao nova e a que ainda nao esta no
   * conjunto. A primeira execucao so estabelece o baseline e nao gera evento. Devolve as movimentacoes
   * novas, na ordem do provedor, com o destino gravado no evento.
   */
  async persistSnapshot(
    clientId: string,
    monitorId: string,
    runId: string,
    destinationProduct: ProcessMonitoringProduct,
    snapshot: ProcessSnapshotInput
  ): Promise<Array<{ occurredAt: string | null; description: string }>> {
    return this.transaction(async (db) => {
      const saved = await db.query<{ id: string; baselineEstablished: boolean }>(
        `INSERT INTO process_monitor_snapshots
           (client_id, monitor_id, monitor_run_id, tribunal, provider_updated_at, process_fingerprint,
            filed_at, class_name, court_name, system_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (client_id, monitor_id)
         DO UPDATE SET monitor_run_id = EXCLUDED.monitor_run_id, tribunal = EXCLUDED.tribunal,
                       provider_updated_at = EXCLUDED.provider_updated_at,
                       process_fingerprint = EXCLUDED.process_fingerprint,
                       filed_at = COALESCE(EXCLUDED.filed_at, process_monitor_snapshots.filed_at),
                       class_name = COALESCE(EXCLUDED.class_name, process_monitor_snapshots.class_name),
                       court_name = COALESCE(EXCLUDED.court_name, process_monitor_snapshots.court_name),
                       system_name = COALESCE(EXCLUDED.system_name, process_monitor_snapshots.system_name),
                       captured_at = now(), updated_at = now()
         RETURNING id, baseline_established AS "baselineEstablished"`,
        [
          clientId, monitorId, runId, snapshot.tribunal, snapshot.providerUpdatedAt, snapshot.processFingerprint,
          snapshot.details?.filedAt ?? null, snapshot.details?.className ?? null,
          snapshot.details?.courtName ?? null, snapshot.details?.systemName ?? null
        ]
      );
      const { id: snapshotId, baselineEstablished } = saved.rows[0]!;
      const created: Array<{ occurredAt: string | null; description: string }> = [];
      const insertedNow = new Set<string>();
      for (const movement of snapshot.movements) {
        const inserted = await db.query<{ id: string; inserted: boolean }>(
          // Movimentacao ja gravada so atualiza o texto (formato novo, Sprint 6); `inserted` separa a
          // nova da atualizada, para nao gerar evento de uma movimentacao antiga.
          `INSERT INTO process_monitor_movements (client_id, snapshot_id, movement_fingerprint, occurred_at, description)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (client_id, snapshot_id, movement_fingerprint)
             DO UPDATE SET description = EXCLUDED.description
             WHERE process_monitor_movements.description IS DISTINCT FROM EXCLUDED.description
           RETURNING id, (xmax = 0) AS inserted`,
          [clientId, snapshotId, movement.fingerprint, movement.occurredAt, movement.description]
        );
        if (!inserted.rows[0]?.inserted) continue;
        insertedNow.add(movement.fingerprint);
        if (!baselineEstablished) continue;
        // Item derivado (mudanca de vara) so e novidade junto com a movimentacao que o revelou.
        if (movement.sourceFingerprint && !insertedNow.has(movement.sourceFingerprint)) continue;
        created.push({ occurredAt: movement.occurredAt, description: movement.description });
        await db.query(
          `INSERT INTO process_monitor_events (client_id, monitor_id, movement_id, event_type, destination_product)
           VALUES ($1, $2, $3, 'movement_detected', $4)`,
          [clientId, monitorId, inserted.rows[0].id, destinationProduct]
        );
      }
      if (!baselineEstablished) {
        await db.query(
          `UPDATE process_monitor_snapshots SET baseline_established = true WHERE client_id = $1 AND id = $2`,
          [clientId, snapshotId]
        );
      }
      return created;
    });
  }

  async recordEvent(clientId: string, monitorId: string, eventType: 'monitor_paused' | 'monitor_deleted', destinationProduct: ProcessMonitoringProduct): Promise<void> {
    await this.query(
      `INSERT INTO process_monitor_events (client_id, monitor_id, event_type, destination_product) VALUES ($1, $2, $3, $4)`,
      [clientId, monitorId, eventType, destinationProduct]
    );
  }

  async listMovements(clientId: string, monitorId: string): Promise<ProcessMovementView[]> {
    const result = await this.query<ProcessMovementView>(
      `SELECT movement.id, movement.description, movement.occurred_at AS "occurredAt", event.created_at AS "detectedAt"
       FROM process_monitor_events event
       JOIN process_monitor_movements movement ON movement.id = event.movement_id AND movement.client_id = event.client_id
       WHERE event.client_id = $1 AND event.monitor_id = $2 AND event.event_type = 'movement_detected'
       ORDER BY event.created_at DESC LIMIT 100`,
      [clientId, monitorId]
    );
    return result.rows;
  }

  /** Fecha a execucao do DJEN; so o sucesso avanca o periodo consultado e a proxima data. */
  async completeDjenRun(
    clientId: string,
    input: { runId: string; monitorId: string; status: string; latencyMs: number; checkedUntil: string | null; nextCheckOn: string | null }
  ): Promise<void> {
    await this.transaction(async (db) => {
      await db.query(
        `UPDATE process_monitor_runs SET status = $3, provider_latency_ms = $4, completed_at = now()
         WHERE id = $1 AND client_id = $2`,
        [input.runId, clientId, input.status, input.latencyMs]
      );
      await db.query(
        `UPDATE process_monitors
            SET djen_last_checked_at = now(),
                djen_checked_until = COALESCE($3::date, djen_checked_until),
                djen_next_check_on = COALESCE($4::date, djen_next_check_on),
                updated_at = now()
          WHERE id = $1 AND client_id = $2`,
        [input.monitorId, clientId, input.checkedUntil, input.nextCheckOn]
      );
    });
  }

  /** Liga/desliga cada fonte e a frequencia do DJEN (ADR 022); `undefined` mantem o valor. */
  async setSources(
    clientId: string,
    id: string,
    input: { datajudEnabled?: boolean; djenEnabled?: boolean; djenCadenceDays?: DjenCadenceDays }
  ): Promise<ProcessMonitorView | null> {
    const result = await this.query<ProcessMonitorView>(
      `UPDATE process_monitors
          SET datajud_enabled = COALESCE($3::boolean, datajud_enabled),
              djen_enabled = CASE WHEN $4::boolean IS NULL THEN djen_enabled ELSE $4::boolean END,
              djen_cadence_days = COALESCE($5::smallint, djen_cadence_days),
              djen_next_check_on = CASE WHEN $5::smallint IS NULL THEN djen_next_check_on ELSE NULL END,
              updated_at = now()
        WHERE client_id = $1 AND id = $2 AND state <> 'deleted'
        RETURNING ${COLUMNS}`,
      [clientId, id, input.datajudEnabled ?? null, input.djenEnabled ?? null, input.djenCadenceDays ?? null]
    );
    return result.rows[0] ?? null;
  }

  /** Dados do periodo do DJEN para a execucao. */
  async findDjenWindow(clientId: string, id: string): Promise<{ checkedUntil: string | null; baselineEstablished: boolean } | null> {
    const result = await this.query<{ checkedUntil: string | null; baselineEstablished: boolean }>(
      `SELECT to_char(djen_checked_until, 'YYYY-MM-DD') AS "checkedUntil", djen_baseline_established AS "baselineEstablished"
         FROM process_monitors WHERE client_id = $1 AND id = $2`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Grava as publicacoes do DJEN deduplicadas pelo hash do provedor. A primeira gravacao so estabelece a
   * base; depois, as inseridas sao novas e ganham evento para o destino. Devolve as novas.
   */
  async persistPublications(
    clientId: string,
    monitorId: string,
    destinationProduct: ProcessMonitoringProduct,
    items: NewProcessPublication[]
  ): Promise<Array<NewProcessPublication & { id: string }>> {
    return this.transaction(async (db) => {
      const state = await db.query<{ baselineEstablished: boolean }>(
        `SELECT djen_baseline_established AS "baselineEstablished" FROM process_monitors
          WHERE client_id = $1 AND id = $2 FOR UPDATE`,
        [clientId, monitorId]
      );
      const baselineEstablished = state.rows[0]?.baselineEstablished ?? false;
      const created: Array<NewProcessPublication & { id: string }> = [];
      for (const item of items) {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO process_monitor_publications
             (client_id, monitor_id, provider_hash, communication_id, available_on, communication_type, document_type,
              court_name, text_ciphertext, encryption_key_version, link, is_new)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (client_id, monitor_id, provider_hash) DO NOTHING RETURNING id`,
          [
            clientId, monitorId, item.providerHash, item.communicationId, item.availableOn, item.communicationType,
            item.documentType, item.courtName, item.textCiphertext, item.encryptionKeyVersion, item.link, baselineEstablished
          ]
        );
        if (!inserted.rows[0] || !baselineEstablished) continue;
        created.push({ ...item, id: inserted.rows[0].id });
        await db.query(
          `INSERT INTO process_monitor_events (client_id, monitor_id, publication_id, event_type, destination_product)
           VALUES ($1, $2, $3, 'publication_detected', $4)`,
          [clientId, monitorId, inserted.rows[0].id, destinationProduct]
        );
      }
      if (!baselineEstablished) {
        await db.query(
          `UPDATE process_monitors SET djen_baseline_established = true WHERE client_id = $1 AND id = $2`,
          [clientId, monitorId]
        );
      }
      return created;
    });
  }

  /** Dados do processo do ultimo retrato (Sprint 9); null antes da primeira consulta ao DataJud. */
  async findProcessDetails(clientId: string, monitorId: string): Promise<ProcessDetailsView | null> {
    const result = await this.query<ProcessDetailsView>(
      `SELECT filed_at AS "filedAt", class_name AS "className", court_name AS "courtName", system_name AS "systemName"
         FROM process_monitor_snapshots WHERE client_id = $1 AND monitor_id = $2`,
      [clientId, monitorId]
    );
    return result.rows[0] ?? null;
  }

  /** Movimentacao do retrato do acompanhamento (para a busca sob demanda no DJEN). */
  async findMovement(clientId: string, monitorId: string, movementId: string): Promise<{ occurredAt: string | null; description: string } | null> {
    const result = await this.query<{ occurredAt: string | null; description: string }>(
      `SELECT movement.occurred_at AS "occurredAt", movement.description
         FROM process_monitor_movements movement
         JOIN process_monitor_snapshots snapshot ON snapshot.id = movement.snapshot_id AND snapshot.client_id = movement.client_id
        WHERE movement.client_id = $1 AND snapshot.monitor_id = $2 AND movement.id = $3`,
      [clientId, monitorId, movementId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Publicacoes trazidas sob demanda (Sprint 9): historico, nunca "nova" nem evento. Deduplicadas pelo
   * hash; a que ja existe fica como esta.
   */
  async saveHistoricalPublications(clientId: string, monitorId: string, items: NewProcessPublication[]): Promise<void> {
    await this.transaction(async (db) => {
      for (const item of items) {
        await db.query(
          `INSERT INTO process_monitor_publications
             (client_id, monitor_id, provider_hash, communication_id, available_on, communication_type, document_type,
              court_name, text_ciphertext, encryption_key_version, link, is_new)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)
           ON CONFLICT (client_id, monitor_id, provider_hash) DO NOTHING`,
          [
            clientId, monitorId, item.providerHash, item.communicationId, item.availableOn, item.communicationType,
            item.documentType, item.courtName, item.textCiphertext, item.encryptionKeyVersion, item.link
          ]
        );
      }
    });
  }

  /** Publicacoes do acompanhamento num periodo (AAAA-MM-DD, inclusive). */
  async listPublicationsBetween(clientId: string, monitorId: string, from: string, to: string): Promise<StoredProcessPublication[]> {
    const result = await this.query<StoredProcessPublication>(
      `SELECT id, to_char(available_on, 'YYYY-MM-DD') AS "availableOn", communication_type AS "communicationType",
              document_type AS "documentType", court_name AS "courtName", text_ciphertext AS "textCiphertext",
              link, is_new AS "isNew"
         FROM process_monitor_publications
        WHERE client_id = $1 AND monitor_id = $2 AND available_on BETWEEN $3::date AND $4::date
        ORDER BY available_on, created_at`,
      [clientId, monitorId, from, to]
    );
    return result.rows;
  }

  /** Publicacoes do acompanhamento, mais recentes primeiro; o texto sai cifrado e o servico decifra. */
  async listPublications(clientId: string, monitorId: string): Promise<StoredProcessPublication[]> {
    const result = await this.query<StoredProcessPublication>(
      `SELECT id, to_char(available_on, 'YYYY-MM-DD') AS "availableOn", communication_type AS "communicationType",
              document_type AS "documentType", court_name AS "courtName", text_ciphertext AS "textCiphertext",
              link, is_new AS "isNew"
         FROM process_monitor_publications
        WHERE client_id = $1 AND monitor_id = $2
        ORDER BY available_on DESC NULLS LAST, created_at DESC
        LIMIT 300`,
      [clientId, monitorId]
    );
    return result.rows;
  }

  /**
   * Todas as movimentacoes do retrato do acompanhamento, mais recentes primeiro (Sprint 5). `isNew`
   * marca as detectadas depois da primeira consulta; as do baseline sao o historico que o processo ja
   * tinha.
   */
  async listProcessMovements(clientId: string, monitorId: string): Promise<ProcessTimelineMovement[]> {
    const result = await this.query<ProcessTimelineMovement>(
      `SELECT movement.id, movement.description, movement.occurred_at AS "occurredAt",
              EXISTS (
                SELECT 1 FROM process_monitor_events event
                 WHERE event.client_id = movement.client_id AND event.monitor_id = snapshot.monitor_id
                   AND event.movement_id = movement.id
                   AND event.event_type = 'movement_detected'
              ) AS "isNew"
         FROM process_monitor_snapshots snapshot
         JOIN process_monitor_movements movement ON movement.snapshot_id = snapshot.id AND movement.client_id = snapshot.client_id
        WHERE snapshot.client_id = $1 AND snapshot.monitor_id = $2
        ORDER BY movement.occurred_at DESC NULLS LAST, movement.created_at DESC
        LIMIT 500`,
      [clientId, monitorId]
    );
    return result.rows;
  }

  /** Remove o agregado dos acompanhamentos excluidos ha mais de 180 dias. */
  async purgeExpired(): Promise<number> {
    const result = await this.query(`DELETE FROM process_monitors WHERE state = 'deleted' AND purge_after <= now()`);
    return result.rowCount ?? 0;
  }

  private query<T extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) {
    return this.database.queryRaw<T>(this.config.processMonitoringConnection, this.config.processMonitoringDatabaseName, text, values);
  }

  private transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.transactionRaw(this.config.processMonitoringConnection, this.config.processMonitoringDatabaseName, handler);
  }
}
