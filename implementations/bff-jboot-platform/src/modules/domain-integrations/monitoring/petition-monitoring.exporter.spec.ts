import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PetitionMonitoringExporter } from './petition-monitoring.exporter';

const NUMBER = '00000016820268260100'; // sintetico, digito verificador valido (TJSP)
const caller = { identityId: 'me', clientId: 'tenant', applicationId: 'flow-app', databaseRef: 'flow-db', scopes: ['flow:read', 'flow:write'], roles: [] };

type Live = { id: string; destinationProduct: 'flow' | 'juridico'; destinationRef: { databaseRef: string; boardId: string; cardId: string } | null } | null;

function build(options: { enabled?: boolean; live?: Live } = {}) {
  const calls: string[] = [];
  const exporter = new PetitionMonitoringExporter(
    {
      requireCaller: async () => ({ ...caller }),
      requireApplication: async () => { throw new Error('o Monitorar nao consulta o Juridico'); }
    } as never,
    { findByIdForClient: async () => ({ boardId: 'origin-board' }) } as never,
    {
      options: async () => ({ petitions: [{ id: 'p1', processNumber: '0000001-68.2026.8.26.0100' }], boards: [], canCreateBoard: false }),
      createMonitoringCard: async (_f: unknown, _m: unknown, boardId: string, cardId: string, petitionId: string, target: string) => {
        calls.push(`card:${boardId}:${cardId}:${petitionId}:${target}`);
        return { petitionId, processNumber: NUMBER, tribunal: 'TJSP', boardId: target, cardId: 'new-card', created: true };
      }
    } as never,
    {
      isEnabled: async () => options.enabled ?? true,
      findLiveByProcess: async () => { calls.push('live'); return options.live ?? null; },
      ensureActive: async (who: { product: string }, dto: { processNumber: string; cadence: string; destinationRef: { databaseRef: string; cardId: string } }) => {
        calls.push(`monitor:${who.product}:${dto.destinationRef.databaseRef}:${dto.destinationRef.cardId}:${dto.processNumber}:${dto.cadence}`);
        return { id: 'monitor-1', created: true };
      }
    } as never
  );
  return { exporter, calls };
}

void test('Envio: card no board escolhido e acompanhamento diario da capacidade com destino no card, sem Juridico', async () => {
  const { exporter, calls } = build();
  const result = await exporter.send(caller, 'origin-card', ['p1'], 'monitor-board', {});
  assert.deepEqual(result.sent, [{ petitionId: 'p1', boardId: 'monitor-board', cardId: 'new-card', cardUrl: '/flow/boards/monitor-board?card=new-card', created: true }]);
  assert.deepEqual(calls, [
    'live',
    'card:origin-board:origin-card:p1:monitor-board',
    `monitor:flow:flow-db:new-card:${NUMBER}:daily`
  ]);
});

void test('Processo ja acompanhado por outro card: 409 com link, antes de criar o card', async () => {
  const { exporter, calls } = build({ live: { id: 'm', destinationProduct: 'flow', destinationRef: { databaseRef: 'flow-db', boardId: 'b9', cardId: 'other-card' } } });
  await assert.rejects(
    () => exporter.send(caller, 'origin-card', ['p1'], 'monitor-board', {}),
    (error: unknown) => error instanceof ConflictException && (error.getResponse() as { cardUrl: string }).cardUrl === '/flow/boards/b9?card=other-card'
  );
  assert.deepEqual(calls, ['live']);
});

void test('Processo acompanhado no Juridico: 409 dizendo onde esta, sem criar card', async () => {
  const { exporter, calls } = build({ live: { id: 'm', destinationProduct: 'juridico', destinationRef: null } });
  await assert.rejects(
    () => exporter.send(caller, 'origin-card', ['p1'], 'monitor-board', {}),
    (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === 'process_monitor_in_use'
  );
  assert.deepEqual(calls, ['live']);
});

void test('Sem a capacidade contratada: envio recusado e opcoes avisam', async () => {
  const { exporter, calls } = build({ enabled: false });
  await assert.rejects(
    () => exporter.send(caller, 'origin-card', ['p1'], 'monitor-board', {}),
    (error: unknown) => error instanceof ForbiddenException && (error.getResponse() as { code: string }).code === 'process_monitoring_not_contracted'
  );
  assert.deepEqual(calls, []);
  assert.equal((await exporter.options(caller, 'origin-card')).monitoringEnabled, false);
});
