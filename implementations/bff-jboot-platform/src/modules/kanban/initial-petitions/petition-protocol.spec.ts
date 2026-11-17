import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { PetitionProtocolRepository } from './petition-protocol.repository';
import { PetitionProtocolService } from './petition-protocol.service';

// Numeros CNJ sinteticos com digito verificador calculado (mod 97); nenhum identifica processo real.
function cnj(sequence: string, tr = '26'): string {
  const n = sequence.padStart(7, '0');
  const tail = `2026` + `8` + tr + `0100`;
  let remainder = 0;
  for (const digit of `${n}${tail}00`) remainder = (remainder * 10 + Number(digit)) % 97;
  return `${n}${String(98 - remainder).padStart(2, '0')}${tail}`;
}

type Query = { query: (sql: string, values?: unknown[]) => Promise<unknown> };

async function board(client: Query, clientId: string, owner: string) {
  const boardId = randomUUID(), columnId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, owner]);
  await client.query(
    `INSERT INTO kanban_board_columns (id,client_id,board_id,name,position,is_default) VALUES($1,$2,$3,'Backlog',0,true)`,
    [columnId, clientId, boardId]
  );
  return { boardId, columnId };
}

/** Card com uma execucao de peticoes e uma peticao; documento atual no status pedido. */
async function cardWithPetition(client: Query, clientId: string, owner: string, target: { boardId: string; columnId: string }, status: 'rascunho' | 'aprovado') {
  const cardId = randomUUID(), runId = randomUUID(), petitionId = randomUUID(), documentId = randomUUID();
  await client.query(
    `INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id) VALUES($1,$2,$3,$4,'Card',0,$5)`,
    [cardId, clientId, target.boardId, target.columnId, owner]
  );
  await client.query(
    `INSERT INTO kanban_card_petition_runs (id,client_id,card_id,customer_id,automation_run_id,generator,status,triage_source,petition_count,submitted_by_identity_id)
     VALUES($1,$2,$3,$4,$5,'ai','concluida','hiscon',1,$6)`,
    [runId, clientId, cardId, randomUUID(), randomUUID(), owner]
  );
  await client.query(
    `INSERT INTO kanban_card_initial_petitions (id,client_id,card_id,petition_run_id,petition_key,position,court,bank,file_name,generator)
     VALUES($1,$2,$3,$4,'pan',1,'jec','PAN','Inicial_JEC_PAN.docx','ai')`,
    [petitionId, clientId, cardId, runId]
  );
  const approved = status === 'aprovado';
  await client.query(
    `INSERT INTO kanban_card_generated_documents
       (id,client_id,card_id,petition_id,version,origin,status,storage_bucket,storage_key,sha256,size_bytes,created_by_identity_id,
        approved_at,approved_by_identity_id,pdf_status)
     VALUES($1,$2,$3,$4,1,'routine_petition',$5,'b',$6,$7,1,$8,$9,$10,$11)`,
    [documentId, clientId, cardId, petitionId, status, `${clientId}/${cardId}/generated/${documentId}.docx`, 'a'.repeat(64), owner,
      approved ? new Date() : null, approved ? owner : null, approved ? 'pending' : null]
  );
  return { cardId, petitionId, documentId };
}

void test('PostgreSQL: CNJ so em peticao aprovada, uma vez, unico no tenant (peticao e card DataJud)', () =>
  withTestDatabase(async (db, client) => {
    const repository = new PetitionProtocolRepository(db);
    const clientId = randomUUID(), owner = randomUUID();
    const origin = await board(client, clientId, owner);
    const draft = await cardWithPetition(client, clientId, owner, origin, 'rascunho');
    const ready = await cardWithPetition(client, clientId, owner, origin, 'aprovado');
    const other = await cardWithPetition(client, clientId, owner, origin, 'aprovado');
    const register = (card: { cardId: string; petitionId: string }, number: string) =>
      repository.register(TEST_DATABASE_REF, clientId, card.cardId, card.petitionId, number, owner);

    assert.deepEqual(await register(draft, cnj('1')), { ok: false, reason: 'not_approved' });
    assert.deepEqual(await register({ cardId: ready.cardId, petitionId: randomUUID() }, cnj('1')), { ok: false, reason: 'not_found' });
    assert.deepEqual(await register(ready, cnj('1')), { ok: true });
    assert.deepEqual(await register(ready, cnj('2')), { ok: false, reason: 'already_registered' }, 'corrigir esta fora da sprint');
    assert.deepEqual(
      await register(other, cnj('1')),
      { ok: false, reason: 'number_in_use', owner: { kind: 'petition', cardId: ready.cardId, boardId: origin.boardId } }
    );

    // Card exportado do DataJud em outro board tambem conta (source_id = "<digitos>:<tribunal>").
    const elsewhere = await board(client, clientId, owner);
    const datajudCardId = randomUUID();
    await client.query(
      `INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id,source_module,source_type,source_id,source_payload)
       VALUES($1,$2,$3,$4,'DataJud',0,$5,'juridico','datajud_processo',$6,'{}'::jsonb)`,
      [datajudCardId, clientId, elsewhere.boardId, elsewhere.columnId, owner, `${cnj('3')}:TJSP`]
    );
    assert.deepEqual(
      await register(other, cnj('3')),
      { ok: false, reason: 'number_in_use', owner: { kind: 'datajud_card', cardId: datajudCardId, boardId: elsewhere.boardId } }
    );
    // Outro tenant nao enxerga o numero.
    const foreign = randomUUID();
    const foreignBoard = await board(client, foreign, owner);
    const foreignCard = await cardWithPetition(client, foreign, owner, foreignBoard, 'aprovado');
    assert.deepEqual(await repository.register(TEST_DATABASE_REF, foreign, foreignCard.cardId, foreignCard.petitionId, cnj('1'), owner), { ok: true });

    await client.query('SAVEPOINT bad_number');
    await assert.rejects(
      client.query(`UPDATE kanban_card_initial_petitions SET protocol_number = '123' WHERE id = $1`, [other.petitionId]),
      /kanban_card_initial_petitions_protocol_cnj_check/
    );
    await client.query('ROLLBACK TO SAVEPOINT bad_number');
  }));

void test('PostgreSQL: peticao monitoravel aparece no board ate ser enviada; envio e idempotente', () =>
  withTestDatabase(async (db, client) => {
    const repository = new PetitionProtocolRepository(db);
    const clientId = randomUUID(), owner = randomUUID();
    const origin = await board(client, clientId, owner);
    const target = await board(client, clientId, owner);
    const ready = await cardWithPetition(client, clientId, owner, origin, 'aprovado');
    // Membro ativo do board (chave de escritorio desligada): ve os cards do board; quem nao e membro, nao.
    await client.query(`INSERT INTO kanban_board_members (client_id, board_id, identity_id, role) VALUES ($1, $2, $3, 'board_member')`, [clientId, origin.boardId, owner]);
    const viewer = { identityId: owner, clientId, isAdmin: false, officeIds: [], officeVisibilityEnabled: false };
    const outsider = { ...viewer, identityId: randomUUID() };
    assert.deepEqual(await repository.monitorableCardIds(TEST_DATABASE_REF, clientId, origin.boardId, viewer), [], 'sem numero ainda');
    await repository.register(TEST_DATABASE_REF, clientId, ready.cardId, ready.petitionId, cnj('10'), owner);
    assert.deepEqual(await repository.monitorableCardIds(TEST_DATABASE_REF, clientId, origin.boardId, viewer), [ready.cardId]);
    assert.deepEqual(await repository.monitorableCardIds(TEST_DATABASE_REF, clientId, origin.boardId, outsider), [], 'escopo unico de visibilidade');
    assert.equal((await repository.findMonitorable(TEST_DATABASE_REF, clientId, ready.cardId)).length, 1);

    const monitoringCardId = randomUUID();
    await client.query(
      `INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id) VALUES($1,$2,$3,$4,'Monitor',0,$5)`,
      [monitoringCardId, clientId, target.boardId, target.columnId, owner]
    );
    const first = await repository.markSent(TEST_DATABASE_REF, clientId, ready.petitionId, { boardId: target.boardId, cardId: monitoringCardId }, owner);
    assert.deepEqual(first, { boardId: target.boardId, cardId: monitoringCardId, first: true });
    const again = await repository.markSent(TEST_DATABASE_REF, clientId, ready.petitionId, { boardId: origin.boardId, cardId: ready.cardId }, owner);
    assert.deepEqual(again, { boardId: target.boardId, cardId: monitoringCardId, first: false }, 'o primeiro envio vence');
    assert.deepEqual(await repository.monitorableCardIds(TEST_DATABASE_REF, clientId, origin.boardId, viewer), []);
    assert.deepEqual(await repository.findMonitorable(TEST_DATABASE_REF, clientId, ready.cardId), []);
  }));

function protocolService(options: { role: 'board_admin' | 'board_member' | 'board_viewer' | null; assignee?: boolean; result?: unknown }) {
  const calls: string[] = [];
  const service = new PetitionProtocolService(
    {
      isCardAssignee: async () => options.assignee ?? false,
      register: async (_db: string, _client: string, _card: string, _petition: string, number: string) => {
        calls.push(`register:${number}`);
        return options.result ?? { ok: true };
      }
    } as never,
    { requireVisibleCard: async () => ({ status: 'active' }) } as never,
    { resolveEffectiveRole: async () => (options.role ? { role: options.role, profileId: null } : null) } as never,
    { createSystemEvent: async (_db: string, _client: string, _card: string, _who: string, kind: string) => { calls.push(kind); } } as never,
    { record: async () => undefined } as never
  );
  return { service, calls };
}

const ctx = { databaseRef: 'db', clientId: 'tenant', identityId: 'me', applicationId: 'app', scopes: [], roles: [] };

void test('Registro: board_admin ou responsavel do card; membro sem responsabilidade e leitor nao', async () => {
  const masked = `${cnj('7').slice(0, 7)}-${cnj('7').slice(7, 9)}.${cnj('7').slice(9, 13)}.8.26.0100`;
  for (const options of [{ role: 'board_admin' as const }, { role: 'board_member' as const, assignee: true }]) {
    const { service, calls } = protocolService(options);
    assert.deepEqual(await service.register(ctx, 'board', 'card', 'petition', masked, ctx), { petitionId: 'petition', protocolNumber: cnj('7'), tribunal: 'TJSP' });
    assert.deepEqual(calls, [`register:${cnj('7')}`, 'card.initial_petition_protocol_registered']);
  }
  for (const options of [{ role: 'board_member' as const }, { role: 'board_viewer' as const, assignee: true }, { role: null }]) {
    const { service, calls } = protocolService(options);
    await assert.rejects(() => service.register(ctx, 'board', 'card', 'petition', cnj('7'), ctx), ForbiddenException);
    assert.deepEqual(calls, []);
  }
});

void test('Registro: digito verificador errado, tribunal sem indice e numero em uso', async () => {
  const { service } = protocolService({ role: 'board_admin' });
  const wrong = `${cnj('7').slice(0, 7)}00${cnj('7').slice(9)}`;
  await assert.rejects(() => service.register(ctx, 'board', 'card', 'petition', wrong, ctx), UnprocessableEntityException);
  await assert.rejects(() => service.register(ctx, 'board', 'card', 'petition', cnj('7', '99'), ctx), UnprocessableEntityException);
  const inUse = protocolService({ role: 'board_admin', result: { ok: false, reason: 'number_in_use', owner: { kind: 'petition', cardId: 'c2', boardId: 'b2' } } });
  await assert.rejects(
    () => inUse.service.register(ctx, 'board', 'card', 'petition', cnj('7'), ctx),
    (error: unknown) => error instanceof ConflictException &&
      (error.getResponse() as { cardUrl: string }).cardUrl === '/flow/boards/b2?card=c2'
  );
});
