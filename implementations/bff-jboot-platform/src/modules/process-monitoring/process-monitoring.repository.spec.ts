import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { ProcessMonitoringCapabilityService } from './process-monitoring-capability.service';
import { NewProcessMonitor, ProcessMonitoringRepository } from './process-monitoring.repository';

// Banco real `jboot_process_monitoring` (docker/postgres/init/123_process_monitoring.sql). Cada teste usa
// um cliente proprio e apaga o que criou.
const config = new AppConfigService();
const database = new DatabaseService(config);
const repository = new ProcessMonitoringRepository(database, config);
const clients: string[] = [];

after(async () => {
  for (const clientId of clients) {
    await database.queryRaw(config.processMonitoringConnection, config.processMonitoringDatabaseName, 'DELETE FROM process_monitors WHERE client_id = $1', [clientId]);
  }
  await database.onModuleDestroy();
});

function newMonitor(clientId: string, overrides: Partial<NewProcessMonitor> = {}): NewProcessMonitor {
  return {
    clientId, identityId: randomUUID(), tribunal: 'TJAM', ciphertext: Buffer.from('cipher'), encryptionKeyVersion: 1,
    hmac: 'a'.repeat(64), hmacKeyVersion: 1, cadence: 'daily', nextCheckAt: new Date(), originProduct: 'flow',
    destinationProduct: 'flow', destinationRef: { databaseRef: 'flow-db', boardId: randomUUID(), cardId: randomUUID() }, ...overrides
  };
}

function client(): string {
  const id = randomUUID();
  clients.push(id);
  return id;
}

void test('um acompanhamento vivo por cliente e processo; excluido libera um novo', async () => {
  const clientId = client();
  const first = await repository.create(newMonitor(clientId));
  await assert.rejects(repository.create(newMonitor(clientId, { destinationProduct: 'juridico', originProduct: 'juridico', destinationRef: { databaseRef: 'j' } })), (error: { code?: string }) => error.code === '23505');
  // Outro cliente com o mesmo processo e independente.
  await repository.create(newMonitor(client()));
  assert.equal(await repository.markDeleted(clientId, first.id), true);
  const second = await repository.create(newMonitor(clientId));
  assert.notEqual(second.id, first.id);
});

void test('destino Flow sem card e recusado pelo banco', async () => {
  await assert.rejects(
    repository.create(newMonitor(client(), { destinationRef: { databaseRef: 'flow-db' } })),
    (error: { code?: string }) => error.code === '23514'
  );
});

void test('primeira execucao so estabelece baseline; a seguinte devolve apenas o que e novo', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId));
  const movement = (n: number) => ({ fingerprint: String(n).repeat(64).slice(0, 64), occurredAt: null, description: `mov ${n}` });
  const run1 = await repository.beginRun(clientId, monitor.id, 'k1', 'wf');
  assert.deepEqual(await repository.persistSnapshot(clientId, monitor.id, run1.id, 'flow', { tribunal: 'TJAM', providerUpdatedAt: null, processFingerprint: 'f'.repeat(64), movements: [movement(1), movement(2)] }), []);
  const run2 = await repository.beginRun(clientId, monitor.id, 'k2', 'wf');
  const created = await repository.persistSnapshot(clientId, monitor.id, run2.id, 'flow', { tribunal: 'TJAM', providerUpdatedAt: null, processFingerprint: 'e'.repeat(64), movements: [movement(1), movement(2), movement(3)] });
  assert.deepEqual(created.map((item) => item.description), ['mov 3']);
  assert.deepEqual((await repository.listMovements(clientId, monitor.id)).map((item) => item.description), ['mov 3']);
  assert.equal((await repository.beginRun(clientId, monitor.id, 'k2', 'wf')).alreadyProcessed, true);
});

void test('nova tentativa refaz a execucao que falhou; a que deu certo segue idempotente; ultima consulta no acompanhamento', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: 'e'.repeat(64) }));
  assert.equal(monitor.lastRunStatus, null);
  const failed = await repository.beginRun(clientId, monitor.id, 'retry-key', 'wf');
  await repository.completeRun(clientId, { runId: failed.id, monitorId: monitor.id, status: 'rate_limited', latencyMs: 5, nextCheckAt: new Date() });
  assert.equal((await repository.find(clientId, monitor.id))?.lastRunStatus, 'rate_limited');
  const retry = await repository.beginRun(clientId, monitor.id, 'retry-key', 'wf-2');
  assert.deepEqual(retry, { id: failed.id, alreadyProcessed: false });
  await repository.completeRun(clientId, { runId: retry.id, monitorId: monitor.id, status: 'success', latencyMs: 5, nextCheckAt: new Date() });
  assert.equal((await repository.beginRun(clientId, monitor.id, 'retry-key', 'wf-3')).alreadyProcessed, true);
  assert.equal((await repository.find(clientId, monitor.id))?.lastRunStatus, 'success');
});

void test('movimentacoes do processo: baseline inteiro mais as novas, marcadas, mais recentes primeiro', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: 'f'.repeat(64) }));
  const movement = (n: number, day: string) => ({ fingerprint: String(n).repeat(64).slice(0, 64), occurredAt: `2026-10-${day}T10:00:00Z`, description: `mov ${n}` });
  const run1 = await repository.beginRun(clientId, monitor.id, 't1', 'wf');
  await repository.persistSnapshot(clientId, monitor.id, run1.id, 'flow', { tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'a'.repeat(64), movements: [movement(1, '01'), movement(2, '05')] });
  assert.deepEqual((await repository.listProcessMovements(clientId, monitor.id)).map((item) => [item.description, item.isNew]), [['mov 2', false], ['mov 1', false]]);
  const run2 = await repository.beginRun(clientId, monitor.id, 't2', 'wf');
  await repository.persistSnapshot(clientId, monitor.id, run2.id, 'flow', { tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'b'.repeat(64), movements: [movement(1, '01'), movement(2, '05'), movement(3, '09')] });
  assert.deepEqual((await repository.listProcessMovements(clientId, monitor.id)).map((item) => [item.description, item.isNew]), [['mov 3', true], ['mov 2', false], ['mov 1', false]]);
  assert.deepEqual(await repository.listProcessMovements(client(), monitor.id), []);
});

void test('texto novo de movimentacao ja gravada so atualiza, sem virar nova nem gerar evento', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: '9'.repeat(64) }));
  const fingerprint = '7'.repeat(64);
  const run1 = await repository.beginRun(clientId, monitor.id, 'd1', 'wf');
  await repository.persistSnapshot(clientId, monitor.id, run1.id, 'flow', { tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'a'.repeat(64), movements: [{ fingerprint, occurredAt: '2026-09-29T10:00:00Z', description: 'Conclusão' }] });
  const run2 = await repository.beginRun(clientId, monitor.id, 'd2', 'wf');
  const created = await repository.persistSnapshot(clientId, monitor.id, run2.id, 'flow', { tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'b'.repeat(64), movements: [{ fingerprint, occurredAt: '2026-09-29T10:00:00Z', description: 'Conclusão — para julgamento' }] });
  assert.deepEqual(created, []);
  assert.deepEqual((await repository.listProcessMovements(clientId, monitor.id)).map((item) => [item.description, item.isNew]), [['Conclusão — para julgamento', false]]);
  assert.deepEqual(await repository.listMovements(clientId, monitor.id), []);
});

void test('DJEN: base silenciosa, depois as novas com evento; deduplicado pelo hash; periodo so avanca no sucesso', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: '8'.repeat(64) }));
  const pub = (hash: string, day: string) => ({
    providerHash: hash, communicationId: null, availableOn: `2026-11-${day}`, communicationType: 'Intimação', documentType: 'DESPACHO/DECISÃO',
    courtName: 'Vara', textCiphertext: Buffer.from(`t-${hash}`), encryptionKeyVersion: 1, link: null, excerpt: 'x'
  });
  assert.deepEqual(await repository.persistPublications(clientId, monitor.id, 'flow', [pub('h1', '03')]), []);
  const created = await repository.persistPublications(clientId, monitor.id, 'flow', [pub('h1', '03'), pub('h2', '06')]);
  assert.deepEqual(created.map((item) => item.providerHash), ['h2']);
  const listed = await repository.listPublications(clientId, monitor.id);
  assert.deepEqual(listed.map((item) => [item.availableOn, item.isNew]), [['2026-11-06', true], ['2026-11-03', false]]);
  assert.deepEqual(await repository.listPublications(client(), monitor.id), []);
  const run = await repository.beginRun(clientId, monitor.id, 'djen-1', 'wf', 'djen');
  await repository.completeDjenRun(clientId, { runId: run.id, monitorId: monitor.id, status: 'success', latencyMs: 1, checkedUntil: '2026-11-09', nextCheckOn: '2026-11-10' });
  const failed = await repository.beginRun(clientId, monitor.id, 'djen-2', 'wf', 'djen');
  await repository.completeDjenRun(clientId, { runId: failed.id, monitorId: monitor.id, status: 'timeout', latencyMs: 1, checkedUntil: null, nextCheckOn: null });
  assert.deepEqual(await repository.findDjenWindow(clientId, monitor.id), { checkedUntil: '2026-11-09', baselineEstablished: true });
  const view = await repository.find(clientId, monitor.id);
  assert.equal(view?.djenNextCheckOn, '2026-11-10');
  assert.equal(view?.djenLastRunStatus, 'timeout');
  assert.equal(view?.lastRunStatus, null);
});

void test('fontes: liga/desliga e frequencia do DJEN; trocar a frequencia libera a proxima consulta', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: '6'.repeat(64) }));
  assert.equal(monitor.datajudEnabled, true);
  assert.equal(monitor.djenEnabled, null);
  assert.equal(monitor.djenCadenceDays, 1);
  const off = await repository.setSources(clientId, monitor.id, { datajudEnabled: false, djenEnabled: true });
  assert.equal(off?.datajudEnabled, false);
  assert.equal(off?.djenEnabled, true);
  const cadence = await repository.setSources(clientId, monitor.id, { djenCadenceDays: 7 });
  assert.equal(cadence?.djenCadenceDays, 7);
  assert.equal(cadence?.djenEnabled, true);
  assert.equal(cadence?.djenNextCheckOn, null);
  await assert.rejects(repository.setSources(clientId, monitor.id, { djenCadenceDays: 14 as never }));
});

void test('mudanca de vara antiga nao vira novidade; a revelada por movimentacao nova vira', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: '5'.repeat(64) }));
  const mv = (n: string) => ({ fingerprint: n.repeat(64).slice(0, 64), occurredAt: '2026-10-01T10:00:00Z', description: `mov ${n}` });
  const run1 = await repository.beginRun(clientId, monitor.id, 'v1', 'wf');
  await repository.persistSnapshot(clientId, monitor.id, run1.id, 'flow', { tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'a'.repeat(64), movements: [mv('1'), mv('2')] });
  const run2 = await repository.beginRun(clientId, monitor.id, 'v2', 'wf');
  const created = await repository.persistSnapshot(clientId, monitor.id, run2.id, 'flow', {
    tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'b'.repeat(64),
    movements: [mv('1'), mv('2'), mv('3'),
      { fingerprint: 'c'.repeat(64), occurredAt: '2026-09-01T10:00:00Z', description: 'Mudança de vara: A → B', sourceFingerprint: mv('2').fingerprint },
      { fingerprint: 'd'.repeat(64), occurredAt: '2026-10-05T10:00:00Z', description: 'Mudança de vara: B → C', sourceFingerprint: mv('3').fingerprint }]
  });
  assert.deepEqual(created.map((item) => item.description), ['mov 3', 'Mudança de vara: B → C']);
});

void test('Sprint 9: dados do processo no retrato e publicacoes sob demanda como historico, sem evento', async () => {
  const clientId = client();
  const monitor = await repository.create(newMonitor(clientId, { hmac: '4'.repeat(64) }));
  const details = { filedAt: '2026-07-17T16:35:27Z', className: 'Procedimento do Juizado Especial Cível', courtName: 'Vara', systemName: 'Projudi' };
  const run1 = await repository.beginRun(clientId, monitor.id, 'd9-1', 'wf');
  await repository.persistSnapshot(clientId, monitor.id, run1.id, 'flow', {
    tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'a'.repeat(64), details,
    movements: [{ fingerprint: '3'.repeat(64), occurredAt: '2026-10-29T02:34:03Z', description: 'Publicação' }]
  });
  const run2 = await repository.beginRun(clientId, monitor.id, 'd9-2', 'wf');
  await repository.persistSnapshot(clientId, monitor.id, run2.id, 'flow', {
    tribunal: 'TRF4', providerUpdatedAt: null, processFingerprint: 'b'.repeat(64),
    details: { filedAt: null, className: null, courtName: null, systemName: null }, movements: []
  });
  const saved = await repository.findProcessDetails(clientId, monitor.id);
  assert.equal(saved?.className, 'Procedimento do Juizado Especial Cível', 'consulta sem o dado nao apaga o anterior');
  assert.equal(new Date(saved!.filedAt!).toISOString(), '2026-07-17T16:35:27.000Z');
  const [movement] = await repository.listProcessMovements(clientId, monitor.id);
  assert.equal((await repository.findMovement(clientId, monitor.id, movement!.id))?.description, 'Publicação');
  assert.equal(await repository.findMovement(client(), monitor.id, movement!.id), null);
  await repository.persistPublications(clientId, monitor.id, 'flow', []);
  const item = (hash: string, day: string) => ({
    providerHash: hash, communicationId: null, availableOn: day, communicationType: 'Intimação', documentType: 'Decisão',
    courtName: 'Vara', textCiphertext: Buffer.from('t'), encryptionKeyVersion: 1, link: null, excerpt: 't'
  });
  await repository.saveHistoricalPublications(clientId, monitor.id, [item('old-1', '2026-10-28'), item('old-2', '2026-12-01')]);
  await repository.saveHistoricalPublications(clientId, monitor.id, [item('old-1', '2026-10-28')]);
  const between = await repository.listPublicationsBetween(clientId, monitor.id, '2026-10-25', '2026-11-07');
  assert.deepEqual(between.map((row) => [row.availableOn, row.isNew]), [['2026-10-28', false]]);
  assert.deepEqual(await repository.listMovements(clientId, monitor.id), []);
});

void test('listagem por destino nao mistura produtos nem clientes', async () => {
  const clientId = client();
  await repository.create(newMonitor(clientId, { hmac: 'b'.repeat(64) }));
  await repository.create(newMonitor(clientId, { hmac: 'c'.repeat(64), originProduct: 'juridico', destinationProduct: 'juridico', destinationRef: { databaseRef: 'j' } }));
  await repository.create(newMonitor(client(), { hmac: 'd'.repeat(64) }));
  assert.equal((await repository.listByDestination(clientId, 'flow')).length, 1);
  assert.equal((await repository.listByDestination(clientId, 'juridico')).length, 1);
});

void test('capacidade habilitada no cliente JBoot e ausente em cliente sem contrato', async () => {
  const capability = new ProcessMonitoringCapabilityService(database);
  const jboot = await database.queryIdentity<{ id: string }>(`SELECT id FROM clients WHERE document_number = '63784101000110'`);
  assert.equal(await capability.isEnabled(jboot.rows[0]!.id), true);
  assert.equal(await capability.isEnabled(randomUUID()), false);
});

void test('o modulo nao importa juridico, kanban nem domain-integrations', () => {
  const offenders = readdirSync(__dirname)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => /from '\.\.\/(juridico|kanban|domain-integrations)\//.test(readFileSync(join(__dirname, file), 'utf8')));
  assert.deepEqual(offenders, []);
});
