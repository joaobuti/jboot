import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { ProcessImportService } from './process-import.service';

// Dados ficticios: CPFs sinteticos e numeros CNJ calculados (mod 97).
function cnj(sequence: string): string {
  const n = sequence.padStart(7, '0');
  const tail = '2026401' + '4200';
  let remainder = 0;
  for (const digit of `${n}${tail}00`) remainder = (remainder * 10 + Number(digit)) % 97;
  return `${n}${String(98 - remainder).padStart(2, '0')}${tail}`;
}
const caller = { identityId: 'me', clientId: 'tenant', applicationId: 'flow-app', databaseRef: 'flow-db', scopes: ['flow:read', 'flow:write'], roles: [] };
const rows = [
  { line: 2, name: 'Teste Um', cpf: '52998224725', processNumber: cnj('1'), situation: 'REPLICA' },
  { line: 3, name: 'Teste Dois', cpf: '11144477735', processNumber: cnj('2') },
  { line: 4, name: 'Teste Tres', cpf: '123', processNumber: cnj('3') }
];

type Live = { id: string; destinationProduct: 'flow' | 'juridico'; destinationRef: { databaseRef: string; boardId: string; cardId: string } | null };
interface Options { enabled?: boolean; flowOwner?: boolean; live?: Record<string, Live>; lotRows?: unknown[]; rowFails?: boolean; queued?: boolean }

function build(options: Options = {}) {
  const calls: string[] = [];
  const lots = {
    findLot: async () => ({ id: 'lot', boardId: 'board', officeId: 'office', createdByIdentityId: 'me', status: 'pending', totalRows: 2 }),
    start: async () => { calls.push('start'); return true; },
    listRows: async () => options.lotRows ?? [
      { id: 'r1', line: 2, processNumber: cnj('1'), tribunal: 'TRF1', status: 'pending', cardId: null },
      { id: 'r2', line: 3, processNumber: cnj('2'), tribunal: 'TRF1', status: 'failed', cardId: null }
    ],
    markRow: async (_db: string, _c: string, id: string, patch: Record<string, unknown>) => { calls.push(`mark:${id}:${String(patch.status)}:${String(patch.errorCode ?? '')}`); },
    finish: async (_db: string, _c: string, _id: string, failure?: string | null) => { calls.push(`finish:${failure ?? 'ok'}`); }
  };
  const service = new ProcessImportService(
    {
      requireCaller: async () => ({ ...caller }),
      requireApplication: async (_c: unknown, slug: string) => {
        if (slug !== 'flow') throw new Error('a importacao nao consulta o Juridico');
        return { ...caller };
      }
    } as never,
    {
      options: async () => ({ boards: [], offices: [] }),
      authorize: async () => { calls.push('authorize'); },
      owners: async () => new Map(options.flowOwner ? [[cnj('2'), { kind: 'petition', cardId: 'pc', boardId: 'pb' }]] : []),
      matchCustomers: async () => new Map([[2, { kind: 'existing', nameDiffers: true }], [3, { kind: 'new' }]]),
      createLot: async (_f: unknown, _m: unknown, _b: string, _o: string, ready: unknown[]) => { calls.push(`lot:${ready.length}`); return 'lot'; },
      processRow: async (_f: unknown, _m: unknown, _lot: unknown, row: { id: string }) => {
        if (options.rowFails && row.id === 'r1') throw new UnprocessableEntityException({ code: 'office_required' });
        calls.push(`row:${row.id}`);
        return { status: 'created', cardId: `card-${row.id}`, customerId: 'cust', skippedAssignees: 0 };
      }
    } as never,
    lots as never,
    {
      isEnabled: async () => options.enabled ?? true,
      findLiveByProcess: async (_who: unknown, number: string) => options.live?.[number] ?? null,
      ensureActive: async (who: { product: string }, dto: { cadence: string; destinationRef: { databaseRef: string; cardId: string } }) => {
        calls.push(`monitor:${who.product}:${dto.destinationRef.databaseRef}:${dto.destinationRef.cardId}:${dto.cadence}`);
        return { id: 'mon', created: true };
      }
    } as never,
    { resolve: async () => ({ isAdmin: false }) } as never,
    { enqueue: async () => { calls.push('enqueue'); return options.queued ?? true; } } as never
  );
  return { service, calls };
}

void test('Conferencia: pronta, numero ja usado com link, invalida; cliente existente com nome diferente vira aviso', async () => {
  const { service } = build({ flowOwner: true });
  const { rows: preview } = await service.preview(caller, 'board', 'office', rows);
  assert.deepEqual(preview.map((row) => row.status), ['ready', 'existing', 'invalid']);
  assert.deepEqual(preview[0].warnings, ['customer_name_differs']);
  assert.equal(preview[1].existingCardUrl, '/flow/boards/pb?card=pc');
  assert.deepEqual(preview[2].problems, ['cpf_invalid']);
});

void test('Processo ja acompanhado por um card conta como existente; acompanhado no Juridico, como existente sem link', async () => {
  const { service } = build({
    live: {
      [cnj('1')]: { id: 'm1', destinationProduct: 'flow', destinationRef: { databaseRef: 'flow-db', boardId: 'b9', cardId: 'monitor-card' } },
      [cnj('2')]: { id: 'm2', destinationProduct: 'juridico', destinationRef: null }
    }
  });
  const { rows: preview } = await service.preview(caller, 'board', 'office', rows.slice(0, 2));
  assert.deepEqual([preview[0].status, preview[0].existingCardUrl], ['existing', '/flow/boards/b9?card=monitor-card']);
  assert.deepEqual([preview[1].status, preview[1].existingCardUrl], ['existing', null]);
  assert.ok(preview[1].warnings.includes('monitored_in_juridico'));
});

void test('Criar: so as linhas prontas entram no lote e o lote vai para a fila', async () => {
  const { service, calls } = build({ flowOwner: true });
  assert.deepEqual(await service.create(caller, 'board', 'office', rows, {}), { importId: 'lot', queued: true, totalRows: 1 });
  assert.deepEqual(calls, ['authorize', 'lot:1', 'enqueue']);
});

void test('Sem a capacidade contratada: conferencia e criacao recusadas antes de tocar o banco, e as opcoes avisam', async () => {
  const { service, calls } = build({ enabled: false });
  await assert.rejects(() => service.preview(caller, 'board', 'office', rows), ForbiddenException);
  await assert.rejects(() => service.create(caller, 'board', 'office', rows, {}), ForbiddenException);
  assert.deepEqual(calls, []);
  assert.equal((await service.options(caller)).monitoringEnabled, false);
});

void test('Processar: cada linha pendente ou que falhou ganha card e acompanhamento diario no card; falha de uma nao para as outras', async () => {
  const { service, calls } = build({ rowFails: true });
  await service.processLot({ flowDatabaseRef: 'flow-db', clientId: 'tenant', importId: 'lot' });
  assert.deepEqual(calls, [
    'start',
    'mark:r1:failed:office_required',
    'row:r2',
    'monitor:flow:flow-db:card-r2:daily',
    'mark:r2:created:',
    'finish:ok'
  ]);
});

void test('Processar: processo acompanhado no Juridico falha a linha sem criar card', async () => {
  const { service, calls } = build({ live: { [cnj('1')]: { id: 'm', destinationProduct: 'juridico', destinationRef: null } } });
  await service.processLot({ flowDatabaseRef: 'flow-db', clientId: 'tenant', importId: 'lot' });
  assert.deepEqual(calls.slice(0, 2), ['start', 'mark:r1:failed:process_monitor_in_use']);
  assert.ok(!calls.includes('row:r1'));
});

void test('Processar sem a capacidade (contrato mudou) encerra o lote como falho, sem criar nada', async () => {
  const { service, calls } = build({ enabled: false });
  await service.processLot({ flowDatabaseRef: 'flow-db', clientId: 'tenant', importId: 'lot' });
  assert.deepEqual(calls, ['finish:entitlement_revoked']);
});
