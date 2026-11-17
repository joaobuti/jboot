import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { ValidationRunRow } from './customer-validation.repository';
import { CustomerIntakeCardService } from './customer-intake-card.service';

const OFFICE = randomUUID();
const BOARD = randomUUID();
const context = { clientId: 'c1', identityId: 'approver', databaseRef: 'ref', scopes: [], roles: [] } as never;
const mutate = { ...(context as object), ip: '127.0.0.1', userAgent: 'test' } as never;

function run(overrides: Partial<ValidationRunRow> = {}): ValidationRunRow {
  return { id: randomUUID(), customerId: 'cust', officeId: null, contractOfficeId: null, intakeOfficeId: OFFICE, ...overrides } as ValidationRunRow;
}

function build(options: {
  board?: string | null;
  columns?: Array<{ id: string; name: string; status: string }>;
  existing?: string | null;
  createThrows?: boolean;
  /** Responsaveis do escritorio (aba Usuarios). */
  responsibles?: string[];
  /** Resultado do sistema de responsaveis; 'throw' simula falha. */
  assign?: { assigned: string[]; skipped: Array<{ identityId: string; reason: string }> } | 'throw';
} = {}) {
  const intake: unknown[][] = [];
  const created: Array<Record<string, unknown>> = [];
  const audits: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const assignCalls: unknown[][] = [];
  const service = new CustomerIntakeCardService(
    {
      listIntakeBoards: async () => new Map(options.board === null ? [] : [[OFFICE, options.board ?? BOARD]]),
      findActiveCustomerCard: async () => options.existing ?? null,
      setIntake: async (...args: unknown[]) => { intake.push(args.slice(3)); },
      listOfficeResponsibles: async (_r: string, _c: string, officeId: string) => (officeId === OFFICE ? options.responsibles ?? [] : [])
    } as never,
    { list: async () => options.columns ?? [{ id: 'col-a', name: 'Analise de Ações', status: 'active' }, { id: 'col-b', name: ' backlog ', status: 'active' }] } as never,
    {
      createCardFromCustomer: async (_r: string, _c: string, input: Record<string, unknown>) => {
        if (options.createThrows) throw new Error('wip_limit_exceeded');
        created.push(input);
        return { cardId: 'card-new', replay: false };
      }
    } as never,
    { findForFlowById: async () => ({ name: 'MARIA DA SILVA' }) } as never,
    { record: async (event: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => { audits.push({ event, payload }); } } as never,
    {
      assignBySystem: async (_c: unknown, boardId: string, cardId: string, ids: string[]) => {
        assignCalls.push([boardId, cardId, ids]);
        if (options.assign === 'throw') throw new Error('db down');
        return options.assign ?? { assigned: ids, skipped: [] };
      }
    } as never
  );
  return { service, intake, created, audits, assignCalls };
}

void test('cria o card no BACKLOG do board de entrada do escritorio, com o cliente e o escritorio', async () => {
  const f = build();
  const confirmed = run();
  const outcome = await f.service.createForConfirmed(context, confirmed, mutate);
  assert.deepEqual(outcome, { result: 'created', boardId: BOARD, cardId: 'card-new', assignees: { assigned: [], skipped: [] } });
  assert.equal(f.created[0].columnId, 'col-b', 'coluna BACKLOG pelo nome, sem diferenciar maiusculas');
  assert.deepEqual([f.created[0].boardId, f.created[0].officeId, f.created[0].customerId, f.created[0].title], [BOARD, OFFICE, 'cust', 'MARIA DA SILVA']);
  assert.equal(f.created[0].idempotencyKey, `validation-intake:${confirmed.id}`);
  assert.deepEqual(f.intake, [['created', BOARD, 'card-new', { assigned: [], skipped: [] }]]);
  assert.equal(JSON.stringify(f.audits[0].payload).includes('MARIA'), false, 'auditoria sem nome do cliente');
});

void test('nao duplica: cliente ja com card ativo no board reaproveita o card', async () => {
  const f = build({ existing: 'card-old' });
  assert.deepEqual(await f.service.createForConfirmed(context, run(), mutate), { result: 'existing', boardId: BOARD, cardId: 'card-old' });
  assert.equal(f.created.length, 0);
});

void test('sem escritorio, sem board de entrada ou sem coluna BACKLOG: registra o motivo e nao cria', async () => {
  assert.equal((await build().service.createForConfirmed(context, run({ intakeOfficeId: null }), mutate)).result, 'no_office');
  assert.equal((await build({ board: null }).service.createForConfirmed(context, run(), mutate)).result, 'no_board');
  const noBacklog = build({ columns: [{ id: 'x', name: 'Entrada', status: 'active' }, { id: 'y', name: 'BACKLOG', status: 'archived' }] });
  assert.deepEqual(await noBacklog.service.createForConfirmed(context, run(), mutate), { result: 'no_backlog', boardId: BOARD, cardId: null });
  assert.equal(noBacklog.created.length, 0);
});

void test('falha ao criar o card nao derruba a confirmacao: resultado failed registrado', async () => {
  const f = build({ createThrows: true });
  assert.deepEqual(await f.service.createForConfirmed(context, run(), mutate), { result: 'failed', boardId: null, cardId: null });
  assert.deepEqual(f.intake, [['failed', null, null, null]]);
});

void test('responsaveis do escritorio viram responsaveis do card; quem nao pode fica de fora com o motivo', async () => {
  const f = build({
    responsibles: ['ana', 'bia'],
    assign: { assigned: ['ana'], skipped: [{ identityId: 'bia', reason: 'not_board_member' }] }
  });
  const outcome = await f.service.createForConfirmed(context, run(), mutate);
  assert.deepEqual(f.assignCalls, [[BOARD, 'card-new', ['ana', 'bia']]]);
  assert.deepEqual(outcome.assignees, { assigned: ['ana'], skipped: [{ identityId: 'bia', reason: 'not_board_member' }] });
  assert.deepEqual(f.intake[0][3], outcome.assignees);
  assert.deepEqual(f.audits[0].payload.assigneeIds, ['ana']);
});

void test('card ja existente nao muda de responsavel; falha ao atribuir mantem o card criado', async () => {
  const existing = build({ existing: 'card-old', responsibles: ['ana'] });
  await existing.service.createForConfirmed(context, run(), mutate);
  assert.deepEqual(existing.assignCalls, []);
  const failing = build({ responsibles: ['ana'], assign: 'throw' });
  const outcome = await failing.service.createForConfirmed(context, run(), mutate);
  assert.equal(outcome.result, 'created');
  assert.deepEqual(outcome.assignees, { assigned: [], skipped: [], error: 'assign_failed' });
});
