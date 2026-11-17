import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ProcessImportRepository } from './process-import.repository';

// Dados ficticios (CPF sintetico e CNJ calculado); nada de planilha real.
const CPF = '52998224725';
function cnj(sequence: string): string {
  const n = sequence.padStart(7, '0');
  const tail = '2026401' + '4200';
  let remainder = 0;
  for (const digit of `${n}${tail}00`) remainder = (remainder * 10 + Number(digit)) % 97;
  return `${n}${String(98 - remainder).padStart(2, '0')}${tail}`;
}

type Query = { query: (sql: string, values?: unknown[]) => Promise<unknown> };

async function board(client: Query, clientId: string, owner: string) {
  const boardId = randomUUID(), columnId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, owner]);
  await client.query(`INSERT INTO kanban_board_columns (id,client_id,board_id,name,position,is_default) VALUES($1,$2,$3,'Backlog',0,true)`, [columnId, clientId, boardId]);
  return { boardId, columnId };
}

async function card(client: Query, clientId: string, owner: string, target: { boardId: string; columnId: string }, source?: { type: string; id: string }) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id,source_module,source_type,source_id,source_payload)
     VALUES($1,$2,$3,$4,'Card',0,$5,$6,$7,$8,$9)`,
    [id, clientId, target.boardId, target.columnId, owner, source ? (source.type === 'datajud_processo' ? 'juridico' : 'kanban') : null,
      source?.type ?? null, source?.id ?? null, source ? '{}' : null]
  );
  return id;
}

void test('PostgreSQL: numero ja usado no tenant por card DataJud ou card importado; outro tenant nao conta', () =>
  withTestDatabase(async (db, client) => {
    const repository = new ProcessImportRepository(db);
    const clientId = randomUUID(), owner = randomUUID();
    const target = await board(client, clientId, owner);
    const datajud = await card(client, clientId, owner, target, { type: 'datajud_processo', id: `${cnj('1')}:TRF1` });
    const imported = await card(client, clientId, owner, target, { type: 'flow_process_import', id: cnj('2') });
    const foreign = randomUUID();
    const foreignBoard = await board(client, foreign, owner);
    await card(client, foreign, owner, foreignBoard, { type: 'flow_process_import', id: cnj('3') });

    const owners = await repository.findProcessOwners(TEST_DATABASE_REF, clientId, [cnj('1'), cnj('2'), cnj('3')]);
    assert.deepEqual(owners.get(cnj('1')), { kind: 'datajud_card', cardId: datajud, boardId: target.boardId });
    assert.deepEqual(owners.get(cnj('2')), { kind: 'import_card', cardId: imported, boardId: target.boardId });
    assert.equal(owners.has(cnj('3')), false, 'outro tenant');
  }));

void test('PostgreSQL: lote grava linhas, marca resultado, conta e apaga nome/CPF/situacao ao concluir', () =>
  withTestDatabase(async (db, client) => {
    const repository = new ProcessImportRepository(db);
    const clientId = randomUUID(), owner = randomUUID();
    const target = await board(client, clientId, owner);
    const importId = await repository.createLot(TEST_DATABASE_REF, clientId, {
      boardId: target.boardId, officeId: randomUUID(), identityId: owner,
      rows: [
        { line: 2, processNumber: cnj('10'), tribunal: 'TRF1', customerName: 'Teste Um', customerCpf: CPF, situation: 'REPLICA' },
        { line: 3, processNumber: cnj('11'), tribunal: 'TRF1', customerName: 'Teste Dois', customerCpf: CPF, situation: null },
        { line: 4, processNumber: cnj('12'), tribunal: 'TRF1', customerName: 'Teste Tres', customerCpf: CPF, situation: null }
      ]
    });
    assert.equal((await repository.findLot(TEST_DATABASE_REF, clientId, importId))?.status, 'pending');
    assert.equal(await repository.findLot(TEST_DATABASE_REF, randomUUID(), importId), null, 'outro tenant');
    assert.equal(await repository.start(TEST_DATABASE_REF, clientId, importId), true);

    const rows = await repository.listRows(TEST_DATABASE_REF, clientId, importId);
    assert.deepEqual(rows.map((row) => [row.line, row.customerCpf, row.situation]), [[2, CPF, 'REPLICA'], [3, CPF, null], [4, CPF, null]]);
    const cardId = await card(client, clientId, owner, target, { type: 'flow_process_import', id: cnj('10') });
    await repository.markRow(TEST_DATABASE_REF, clientId, rows[0].id, { status: 'created', cardId, extrasDone: true });
    await repository.markRow(TEST_DATABASE_REF, clientId, rows[1].id, { status: 'existing', existingCardId: cardId, existingBoardId: target.boardId });
    await repository.markRow(TEST_DATABASE_REF, clientId, rows[2].id, { status: 'failed', errorCode: 'office_required' });

    await repository.finish(TEST_DATABASE_REF, clientId, importId);
    const lot = await repository.findLot(TEST_DATABASE_REF, clientId, importId);
    assert.deepEqual([lot?.status, lot?.createdCount, lot?.existingCount, lot?.failedCount], ['completed', 1, 1, 1]);
    const after = await repository.listRows(TEST_DATABASE_REF, clientId, importId);
    assert.ok(after.every((row) => row.customerCpf === null && row.customerName === null && row.situation === null), 'minimizacao');
    assert.deepEqual(after.map((row) => row.errorCode), [null, null, 'office_required']);
    assert.equal(await repository.start(TEST_DATABASE_REF, clientId, importId), false, 'lote concluido nao recomeca');

    assert.equal(await repository.addAssignees(TEST_DATABASE_REF, clientId, cardId, [owner], owner), 1);
    assert.equal(await repository.addAssignees(TEST_DATABASE_REF, clientId, cardId, [owner], owner), 0, 'retry nao duplica');
  }));
