import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { AiAutomationOutboxRepository } from './ai-automation-outbox.repository';

void test('AI outbox recovers a card movement idempotently and exposes a claimable snapshot', async () => {
  await withTestDatabase(async (db, client) => {
    const clientId = randomUUID(), identityId = randomUUID(), boardId = randomUUID();
    const fromColumnId = randomUUID(), toColumnId = randomUUID(), cardId = randomUUID();
    const ruleId = randomUUID(), activityId = randomUUID(), agentId = randomUUID();
    await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, identityId]);
    await client.query(`INSERT INTO kanban_board_columns (id,client_id,board_id,name,position) VALUES($1,$2,$3,'From',0),($4,$2,$3,'To',1)`, [fromColumnId, clientId, boardId, toColumnId]);
    await client.query(`INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id) VALUES($1,$2,$3,$4,'Card',0,$5)`, [cardId, clientId, boardId, toColumnId, identityId]);
    await client.query(
      `INSERT INTO kanban_column_automation_rules
       (id,client_id,board_id,board_column_id,trigger_type,action_type,recipient_role,action_config,created_by_identity_id)
       VALUES($1,$2,$3,$4,'column_entered','execute_ai_agent',NULL,$5::jsonb,$6)`,
      [ruleId, clientId, boardId, toColumnId, JSON.stringify({ agentId, connectionMode: 'api_key', inputPolicyVersion: 1, toolPolicyVersion: '2026-10-15.v1' }), identityId],
    );
    await client.query(
      `INSERT INTO kanban_card_activities (id,client_id,card_id,type,author_identity_id,event_payload)
       VALUES($1,$2,$3,'system_event',$4,$5::jsonb)`,
      [activityId, clientId, cardId, identityId, JSON.stringify({ kind: 'card.moved', fromBoardColumnId: fromColumnId, toBoardColumnId: toColumnId })],
    );
    const repository = new AiAutomationOutboxRepository(db);
    await repository.recoverMissing(TEST_DATABASE_REF, clientId);
    await repository.recoverMissing(TEST_DATABASE_REF, clientId);
    const [outboxId] = await repository.listDue(TEST_DATABASE_REF, clientId);
    assert.ok(outboxId);
    const claimed = await repository.claim(TEST_DATABASE_REF, outboxId);
    assert.equal(claimed?.agentId, agentId);
    assert.equal((await repository.snapshot(TEST_DATABASE_REF, claimed!))?.card.title, 'Card');
    assert.equal(await repository.claim(TEST_DATABASE_REF, outboxId), null);
  });
});

void test('AI outbox (claude_routine): dispara, reagenda e so o dono conclui no mesmo card', async () => {
  await withTestDatabase(async (db, client) => {
    const clientId = randomUUID(), owner = randomUUID(), boardId = randomUUID(), columnId = randomUUID();
    const cardId = randomUUID(), otherCardId = randomUUID(), ruleId = randomUUID(), activityId = randomUUID();
    await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, owner]);
    await client.query(`INSERT INTO kanban_board_columns (id,client_id,board_id,name,position) VALUES($1,$2,$3,'To',0)`, [columnId, clientId, boardId]);
    await client.query(`INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id) VALUES($1,$2,$3,$4,'Card',0,$5),($6,$2,$3,$4,'Outro',1,$5)`, [cardId, clientId, boardId, columnId, owner, otherCardId]);
    await client.query(
      `INSERT INTO kanban_column_automation_rules (id,client_id,board_id,board_column_id,trigger_type,action_type,recipient_role,action_config,created_by_identity_id)
       VALUES($1,$2,$3,$4,'column_entered','execute_ai_agent',NULL,$5::jsonb,$6)`,
      [ruleId, clientId, boardId, columnId, JSON.stringify({ agentId: randomUUID(), connectionMode: 'claude_routine', inputPolicyVersion: 1, toolPolicyVersion: 'claude_routine.v1' }), owner],
    );
    await client.query(`INSERT INTO kanban_card_activities (id,client_id,card_id,type,author_identity_id,event_payload) VALUES($1,$2,$3,'system_event',$4,$5::jsonb)`,
      [activityId, clientId, cardId, owner, JSON.stringify({ kind: 'card.moved', toBoardColumnId: columnId })]);
    const repository = new AiAutomationOutboxRepository(db);
    await repository.recoverMissing(TEST_DATABASE_REF, clientId);
    const [id] = await repository.listDue(TEST_DATABASE_REF, clientId);
    let claimed = await repository.claim(TEST_DATABASE_REF, id);
    assert.equal(claimed?.dispatchAttempt, 1);

    await repository.rescheduleRoutine(TEST_DATABASE_REF, id, 'routine_rate_limited', 60);
    const after = await client.query(`SELECT status, dispatch_attempt, next_attempt_at > NOW() AS later FROM kanban_ai_automation_outbox WHERE id = $1`, [id]);
    assert.deepEqual([after.rows[0].status, after.rows[0].dispatch_attempt, after.rows[0].later], ['pending', 2, true]);

    await client.query(`UPDATE kanban_ai_automation_outbox SET next_attempt_at = NOW() WHERE id = $1`, [id]);
    claimed = await repository.claim(TEST_DATABASE_REF, id);
    assert.equal(claimed?.dispatchAttempt, 2);
    const executionId = randomUUID();
    await repository.markDispatched(TEST_DATABASE_REF, id, executionId, 'https://claude.ai/code/session_1');
    assert.deepEqual(await repository.listDue(TEST_DATABASE_REF, clientId), [], 'dispatched nao volta para a fila');

    assert.equal(await repository.completeDispatched(TEST_DATABASE_REF, clientId, { id, cardId, ownerIdentityId: randomUUID() }), false, 'outro usuario');
    assert.equal(await repository.completeDispatched(TEST_DATABASE_REF, clientId, { id, cardId: otherCardId, ownerIdentityId: owner }), false, 'outro card');
    assert.equal(await repository.completeDispatched(TEST_DATABASE_REF, randomUUID(), { id, cardId, ownerIdentityId: owner }), false, 'outro tenant');
    assert.equal(await repository.completeDispatched(TEST_DATABASE_REF, clientId, { id, cardId, ownerIdentityId: owner }), true);
    assert.equal(await repository.completeDispatched(TEST_DATABASE_REF, clientId, { id, cardId, ownerIdentityId: owner }), false, 'idempotente');
  });
});
