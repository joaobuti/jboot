/**
 * Migra os acompanhamentos DataJud do banco do Juridico para a capacidade `monitoramento-processual`
 * (ADR 021, Sprint 2 de docs/product/process-monitoring-sprints.md).
 *
 * - Mantem o id de cada acompanhamento: os vinculos `juridico_data_flow_exports.monitor_id` continuam
 *   validos e a chave dos eventos no card (`juridico-process:<monitor>:<retrato>`) nao se repete.
 * - Destino `flow` quando existe vinculo com card (Monitorar, importacao ou toggle do card); senao
 *   destino `juridico`, com o `database_ref` do Juridico do cliente.
 * - Copia execucoes, retrato (baseline), movimentacoes e eventos: a primeira execucao nova nao trata
 *   o historico como novidade.
 * - Habilita a capacidade nos clientes migrados e troca os workflows ativos (para o antigo, inicia o
 *   novo). Idempotente: rodar de novo nao duplica nada.
 *
 * Uso (dentro do container):
 *   npm run migrate:process-monitors -- [--dry-run] [--no-workflows]
 */
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { cadenceSeconds } from '../modules/process-monitoring/process-fingerprint';
import { PROCESS_MONITORING_CAPABILITY, ProcessMonitorCadence } from '../modules/process-monitoring/process-monitoring.types';

interface JuridicoRef { id: string; clientId: string; connection: string; database: string }

interface OldMonitor {
  id: string; clientId: string; createdByIdentityId: string; tribunal: string | null; ciphertext: Buffer;
  encryptionKeyVersion: number; hmac: string; hmacKeyVersion: number; cadence: ProcessMonitorCadence;
  state: 'active' | 'paused' | 'deleted'; lastCheckedAt: Date | null; nextCheckAt: Date | null; pausedAt: Date | null;
  deletedAt: Date | null; purgeAfter: Date | null; createdAt: Date; updatedAt: Date;
}

interface MigrationReport { monitors: number; flow: number; juridico: number; skipped: string[]; workflows: number; clients: number }

const dryRun = process.argv.includes('--dry-run');
const withWorkflows = !process.argv.includes('--no-workflows');

async function main(): Promise<void> {
  const config = new AppConfigService();
  const database = new DatabaseService(config);
  const target = (text: string, values: unknown[] = []) =>
    database.queryRaw(config.processMonitoringConnection, config.processMonitoringDatabaseName, text, values);
  const report: MigrationReport = { monitors: 0, flow: 0, juridico: 0, skipped: [], workflows: 0, clients: 0 };
  const migratedClients = new Set<string>();
  const toRestart: Array<{ id: string; clientId: string; cadence: ProcessMonitorCadence }> = [];
  try {
    const refs = await database.queryIdentity<JuridicoRef>(
      `SELECT dr.id, dr.client_id AS "clientId", dr.connection_name AS connection, dr.database_name AS database
       FROM database_refs dr JOIN applications a ON a.id = dr.application_id
       WHERE a.slug = 'juridico' AND dr.status = 'active' AND dr.client_id IS NOT NULL`
    );
    for (const ref of refs.rows) {
      const source = (text: string, values: unknown[] = []) => database.queryRaw(ref.connection, ref.database, text, values);
      const monitors = await source(
        `SELECT id, client_id AS "clientId", created_by_identity_id AS "createdByIdentityId", tribunal,
                process_number_ciphertext AS ciphertext, encryption_key_version AS "encryptionKeyVersion",
                process_number_hmac AS hmac, hmac_key_version AS "hmacKeyVersion", cadence, state,
                last_checked_at AS "lastCheckedAt", next_check_at AS "nextCheckAt", paused_at AS "pausedAt",
                deleted_at AS "deletedAt", purge_after AS "purgeAfter", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM juridico_data_monitors WHERE client_id = $1 ORDER BY created_at`,
        [ref.clientId]
      );
      for (const monitor of monitors.rows as OldMonitor[]) {
        const link = await source(
          `SELECT flow_database_ref AS "databaseRef", board_id AS "boardId", card_id AS "cardId"
           FROM juridico_data_flow_exports WHERE client_id = $1 AND monitor_id = $2 ORDER BY created_at LIMIT 1`,
          [ref.clientId, monitor.id]
        );
        const flowRef = link.rows[0] as { databaseRef: string; boardId: string; cardId: string } | undefined;
        const product = flowRef ? 'flow' : 'juridico';
        const destinationRef = flowRef ?? { databaseRef: ref.id };
        if (dryRun) {
          console.log(`[dry-run] monitor=${monitor.id} client=${ref.clientId} state=${monitor.state} destination=${product}`);
          report.monitors += 1;
          report[product] += 1;
          continue;
        }
        const inserted = await target(
          `INSERT INTO process_monitors
             (id, client_id, created_by_identity_id, tribunal, process_number_ciphertext, encryption_key_version,
              process_number_hmac, hmac_key_version, cadence, state, origin_product, destination_product, destination_ref,
              last_checked_at, next_check_at, paused_at, deleted_at, purge_after, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [monitor.id, ref.clientId, monitor.createdByIdentityId, monitor.tribunal, monitor.ciphertext, monitor.encryptionKeyVersion,
            monitor.hmac, monitor.hmacKeyVersion, monitor.cadence, monitor.state, product, JSON.stringify(destinationRef),
            monitor.lastCheckedAt, monitor.nextCheckAt, monitor.pausedAt, monitor.deletedAt, monitor.purgeAfter, monitor.createdAt, monitor.updatedAt]
        ).catch((error: { code?: string }) => {
          if (error.code === '23505') return null;
          throw error;
        });
        if (inserted === null) {
          report.skipped.push(`${monitor.id}: processo ja acompanhado na capacidade`);
          continue;
        }
        if (inserted.rows.length > 0) {
          await copyHistory(source, target, ref.clientId, monitor.id, product);
          report.monitors += 1;
          report[product] += 1;
        }
        migratedClients.add(ref.clientId);
        if (monitor.state === 'active') toRestart.push({ id: monitor.id, clientId: ref.clientId, cadence: monitor.cadence });
      }
    }
    if (!dryRun) {
      for (const clientId of migratedClients) {
        await database.queryIdentity(
          `INSERT INTO client_capabilities (client_id, capability, enabled, enabled_at) VALUES ($1, $2, true, now())
           ON CONFLICT (client_id, capability) DO UPDATE SET enabled = true, enabled_at = COALESCE(client_capabilities.enabled_at, now())`,
          [clientId, PROCESS_MONITORING_CAPABILITY]
        );
        report.clients += 1;
      }
      if (withWorkflows) {
        for (const monitor of toRestart) {
          await worker(config, `/datajud/monitors/${monitor.id}/stop`, { client_id: monitor.clientId, deleted: false });
          await worker(config, '/process-monitors', { monitor_id: monitor.id, client_id: monitor.clientId, cadence_seconds: cadenceSeconds(monitor.cadence) });
          report.workflows += 1;
        }
      }
    }
    console.log(JSON.stringify({ dryRun, withWorkflows, ...report }, null, 2));
  } finally {
    await database.onModuleDestroy();
  }
}

type Query = (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

async function copyHistory(source: Query, target: Query, clientId: string, monitorId: string, product: string): Promise<void> {
  const runs = await source(
    `SELECT id, idempotency_key, workflow_run_id, status, provider_latency_ms, started_at, completed_at
     FROM juridico_data_monitor_runs WHERE client_id = $1 AND monitor_id = $2`,
    [clientId, monitorId]
  );
  for (const run of runs.rows) {
    await target(
      `INSERT INTO process_monitor_runs (id, client_id, monitor_id, idempotency_key, workflow_run_id, status, provider_latency_ms, started_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [run.id, clientId, monitorId, run.idempotency_key, run.workflow_run_id, run.status, run.provider_latency_ms, run.started_at, run.completed_at]
    );
  }
  const snapshot = (await source(
    `SELECT id, monitor_run_id, tribunal, provider_updated_at, process_fingerprint, baseline_established, captured_at, updated_at
     FROM juridico_data_process_snapshots WHERE client_id = $1 AND monitor_id = $2 AND origin = 'monitor' AND monitor_run_id IS NOT NULL`,
    [clientId, monitorId]
  )).rows[0];
  if (snapshot) {
    await target(
      `INSERT INTO process_monitor_snapshots
         (id, client_id, monitor_id, monitor_run_id, tribunal, provider_updated_at, process_fingerprint, baseline_established, captured_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [snapshot.id, clientId, monitorId, snapshot.monitor_run_id, snapshot.tribunal, snapshot.provider_updated_at,
        snapshot.process_fingerprint, snapshot.baseline_established, snapshot.captured_at, snapshot.updated_at]
    );
    const movements = await source(
      `SELECT id, movement_fingerprint, occurred_at, description, created_at
       FROM juridico_data_snapshot_movements WHERE client_id = $1 AND snapshot_id = $2`,
      [clientId, snapshot.id]
    );
    for (const movement of movements.rows) {
      await target(
        `INSERT INTO process_monitor_movements (id, client_id, snapshot_id, movement_fingerprint, occurred_at, description, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [movement.id, clientId, snapshot.id, movement.movement_fingerprint, movement.occurred_at, movement.description, movement.created_at]
      );
    }
  }
  // `purged` nao existe no banco novo: o acompanhamento purgado nem chega aqui.
  const events = await source(
    `SELECT e.id, e.snapshot_movement_id, e.event_type, e.created_at
     FROM juridico_data_monitor_events e
     WHERE e.client_id = $1 AND e.monitor_id = $2 AND e.event_type <> 'purged'
       AND (e.snapshot_movement_id IS NULL OR $3::boolean)`,
    [clientId, monitorId, Boolean(snapshot)]
  );
  for (const event of events.rows) {
    await target(
      `INSERT INTO process_monitor_events (id, client_id, monitor_id, movement_id, event_type, destination_product, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [event.id, clientId, monitorId, event.snapshot_movement_id, event.event_type, product, event.created_at]
    );
  }
}

async function worker(config: AppConfigService, path: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${config.workerJuridicoUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-jboot-worker-secret': config.juridicoWorkerInternalSecret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`worker ${path} respondeu ${response.status}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
