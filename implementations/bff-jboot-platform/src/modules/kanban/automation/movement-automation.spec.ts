import { EntryRequirementsService } from './entry-requirements.service';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withTestDatabase, TEST_DATABASE_REF } from '../../../test/with-test-database';
import { buildRealVisibility } from '../../../test/kanban-visibility';
import { CardsRepository } from '../cards/cards.repository';
import { CardsService } from '../cards/cards.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { MovementAutomationRepository } from './movement-automation.repository';
import { MovementAutomationService } from './movement-automation.service';
import { AiAutomationOutboxRepository } from './ai-automation-outbox.repository';

for (const mode of ['success', 'revoked', 'wip', 'checklist', 'stale-claim', 'already-moved', 'loop', 'disabled'] as const) {
  void test(`Real PostgreSQL: explicit AI completion -> canonical movement, ${mode}`, async () => {
    await withTestDatabase(async (baseDb, client) => {
      // Real nested rollback: a failed receipt must roll back card/positions too.
      const db = Object.create(baseDb) as typeof baseDb;
      db.transactionForDatabaseRef = async (_ref, handler) => {
        await client.query('SAVEPOINT movement_test');
        try { const result = await handler(client as never); await client.query('RELEASE SAVEPOINT movement_test'); return result; }
        catch (error) { await client.query('ROLLBACK TO SAVEPOINT movement_test'); throw error; }
      };
      const tenant = randomUUID(), owner = randomUUID(), board = randomUUID();
      const source = randomUUID(), target = randomUUID(), cardId = randomUUID(), activityId = randomUUID();
      const aiRule = randomUUID(), moveRule = randomUUID();
      await client.query(`INSERT INTO kanban_boards(id,client_id,name,created_by_identity_id) VALUES($1,$2,'Automation test',$3)`,[board,tenant,owner]);
      await client.query(`INSERT INTO kanban_board_columns(id,client_id,board_id,name,position) VALUES($1,$3,$4,'Source',0),($2,$3,$4,'Target',1)`,[source,target,tenant,board]);
      await client.query(`INSERT INTO kanban_board_members(client_id,board_id,identity_id,role) VALUES($1,$2,$3,'board_admin')`,[tenant,board,owner]);
      await client.query(`INSERT INTO kanban_cards(id,client_id,board_id,board_column_id,title,position,created_by_identity_id)
        VALUES($1,$2,$3,$4,'Card',0,$5)`,[cardId,tenant,board,source,owner]);
      await client.query(`INSERT INTO kanban_column_automation_rules(id,client_id,board_id,board_column_id,trigger_type,action_type,action_config,created_by_identity_id)
        VALUES($1,$3,$4,$5,'column_entered','execute_ai_agent',$6::jsonb,$7),($2,$3,$4,$5,'ai_completed','move_card',$8::jsonb,$7)`,
      [aiRule,moveRule,tenant,board,source,JSON.stringify({ agentId:randomUUID() }),owner,JSON.stringify({toBoardColumnId:target})]);
      await client.query(`INSERT INTO kanban_card_activities(id,client_id,card_id,type,author_identity_id,event_payload)
        VALUES($1,$2,$3,'system_event',$4,$5::jsonb)`,[activityId,tenant,cardId,owner,JSON.stringify({kind:'card.moved',toBoardColumnId:source})]);
      const ai = new AiAutomationOutboxRepository(db), movements = new MovementAutomationRepository(db);
      await ai.recoverMissing(TEST_DATABASE_REF,tenant);
      const [aiId] = await ai.listDue(TEST_DATABASE_REF,tenant);
      await ai.claim(TEST_DATABASE_REF,aiId);
      await ai.markDispatched(TEST_DATABASE_REF,aiId,randomUUID(),null);
      await movements.recover(TEST_DATABASE_REF,tenant);
      assert.equal(await movements.claim(TEST_DATABASE_REF,tenant),null,'dispatch/comment alone must not trigger');
      assert.equal(await ai.completeDispatched(TEST_DATABASE_REF,randomUUID(),{id:aiId,cardId,ownerIdentityId:owner}),false);
      assert.equal(await ai.completeDispatched(TEST_DATABASE_REF,tenant,{id:aiId,cardId,ownerIdentityId:randomUUID()}),false);
      assert.equal(await ai.completeDispatched(TEST_DATABASE_REF,tenant,{id:aiId,cardId,ownerIdentityId:owner}),true);
      assert.equal(await ai.completeDispatched(TEST_DATABASE_REF,tenant,{id:aiId,cardId,ownerIdentityId:owner}),false);
      await movements.recover(TEST_DATABASE_REF,tenant);
      await movements.recover(TEST_DATABASE_REF,tenant);
      const run = await movements.claim(TEST_DATABASE_REF,tenant);
      assert.ok(run);
      assert.equal(await movements.claim(TEST_DATABASE_REF,randomUUID()),null,'tenant isolation');
      if (mode==='wip') {
        await client.query(`UPDATE kanban_board_columns SET wip_limit=1 WHERE id=$1`,[target]);
        await client.query(`INSERT INTO kanban_cards(client_id,board_id,board_column_id,title,position,created_by_identity_id)
          VALUES($1,$2,$3,'Existing',0,$4)`,[tenant,board,target,owner]);
      }
      if (mode==='checklist') {
        await client.query(`UPDATE kanban_board_columns SET requires_complete_checklist=true WHERE id=$1`,[target]);
        await client.query(`INSERT INTO kanban_board_document_types(client_id,board_id,name,required,sort_order) VALUES($1,$2,'Required',true,0)`,[tenant,board]);
      }
      if (mode==='stale-claim') await client.query(`UPDATE kanban_movement_automation_outbox SET claim_token=gen_random_uuid() WHERE id=$1`,[run.id]);
      if (mode==='already-moved') await client.query(`UPDATE kanban_cards SET board_column_id=$1 WHERE id=$2`,[target,cardId]);
      if (mode==='loop') run.depth=11;
      if (mode==='disabled') await client.query(`UPDATE kanban_column_automation_rules SET is_active=false WHERE id=$1`,[moveRule]);
      const {access,visibility} = buildRealVisibility(db);
      const docs = new CardDocumentsRepository(db), columns = new ColumnsRepository(db);
      const cards = new CardsService(new CardsRepository(db),columns,new ActivitiesRepository(db),{} as never,{} as never,
        access,new KanbanAuditService(db),new AssigneesRepository(db),
        {recordForActivity:async()=>undefined} as never,{notify:async()=>undefined} as never,new ChecklistGateService(docs),docs,
        visibility,{} as never,{} as never,{} as never,new EntryRequirementsService(db));
      const actor = {identityId:owner,clientId:tenant,databaseRef:TEST_DATABASE_REF,applicationId:randomUUID(),scopes:['flow:read','flow:admin'],roles:['client_admin']};
      const processor = new MovementAutomationService(movements,{} as never,
        {automationActor:async()=>mode==='revoked'?null:actor} as never,visibility,cards,
        {broadcastCardMoved:async()=>undefined} as never);
      await processor.execute(TEST_DATABASE_REF,run);
      const stored = await client.query(`SELECT board_column_id FROM kanban_cards WHERE id=$1`,[cardId]);
      assert.equal(stored.rows[0].board_column_id,mode==='success'||mode==='already-moved'?target:source);
      const receipt = await client.query(`SELECT status FROM kanban_movement_automation_outbox WHERE id=$1`,[run.id]);
      assert.equal(receipt.rows[0].status,mode==='success'?'completed':mode==='stale-claim'?'processing':'skipped');
      assert.equal((await client.query(`SELECT count(*)::int n FROM kanban_card_activities WHERE client_id=$1 AND event_payload->>'kind'='ai.automation_completed'`,[tenant])).rows[0].n,1);
      if(mode==='success') {
        await processor.execute(TEST_DATABASE_REF,run);
        assert.equal((await client.query(`SELECT count(*)::int n FROM kanban_movement_automation_outbox WHERE client_id=$1`,[tenant])).rows[0].n,1);
      }
    });
  });
}

void test('Real PostgreSQL: kit assinado aprovado -> Ir para a coluna, so para o card na coluna da regra (S3)', async () => {
  await withTestDatabase(async (baseDb, client) => {
    const db = Object.create(baseDb) as typeof baseDb;
    db.transactionForDatabaseRef = async (_ref, handler) => {
      await client.query('SAVEPOINT movement_test');
      try { const result = await handler(client as never); await client.query('RELEASE SAVEPOINT movement_test'); return result; }
      catch (error) { await client.query('ROLLBACK TO SAVEPOINT movement_test'); throw error; }
    };
    const tenant = randomUUID(), owner = randomUUID(), board = randomUUID();
    const waiting = randomUUID(), other = randomUUID(), target = randomUUID();
    const cardWaiting = randomUUID(), cardElsewhere = randomUUID();
    await client.query(`INSERT INTO kanban_boards(id,client_id,name,created_by_identity_id) VALUES($1,$2,'Juridico',$3)`,[board,tenant,owner]);
    await client.query(`INSERT INTO kanban_board_columns(id,client_id,board_id,name,position) VALUES($1,$4,$5,'Aguardando assinatura',0),($2,$4,$5,'Outra',1),($3,$4,$5,'Analise de Acoes',2)`,[waiting,other,target,tenant,board]);
    await client.query(`INSERT INTO kanban_board_members(client_id,board_id,identity_id,role) VALUES($1,$2,$3,'board_admin')`,[tenant,board,owner]);
    await client.query(`INSERT INTO kanban_cards(id,client_id,board_id,board_column_id,title,position,created_by_identity_id)
      VALUES($1,$3,$4,$5,'Aguarda',0,$7),($2,$3,$4,$6,'Outra coluna',0,$7)`,[cardWaiting,cardElsewhere,tenant,board,waiting,other,owner]);
    await client.query(`INSERT INTO kanban_column_automation_rules(client_id,board_id,board_column_id,trigger_type,action_type,action_config,created_by_identity_id)
      VALUES($1,$2,$3,'signed_kit_approved','move_card',$4::jsonb,$5)`,[tenant,board,waiting,JSON.stringify({toBoardColumnId:target}),owner]);
    for (const cardId of [cardWaiting, cardElsewhere]) {
      await client.query(`INSERT INTO kanban_card_activities(client_id,card_id,type,author_identity_id,event_payload)
        VALUES($1,$2,'system_event',$3,$4::jsonb)`,[tenant,cardId,owner,JSON.stringify({kind:'card.signed_kit_approved',kitId:randomUUID()})]);
    }
    await client.query('SAVEPOINT shape_check');
    await assert.rejects(
      client.query(`INSERT INTO kanban_column_automation_rules(client_id,board_id,board_column_id,trigger_type,action_type,recipient_role,created_by_identity_id)
        VALUES($1,$2,$3,'signed_kit_approved','send_email_notification','creator',$4)`,[tenant,board,waiting,owner]),
      /kanban_automation_signed_kit_approved_check/
    );
    await client.query('ROLLBACK TO SAVEPOINT shape_check');
    const movements = new MovementAutomationRepository(db);
    await movements.recover(TEST_DATABASE_REF,tenant);
    await movements.recover(TEST_DATABASE_REF,tenant);
    const queued = await client.query(`SELECT card_id FROM kanban_movement_automation_outbox WHERE client_id=$1`,[tenant]);
    assert.deepEqual(queued.rows.map((row) => row.card_id),[cardWaiting],'so o card da coluna da regra, uma vez');
    const run = await movements.claim(TEST_DATABASE_REF,tenant);
    assert.ok(run);
    const {access,visibility} = buildRealVisibility(db);
    const docs = new CardDocumentsRepository(db), columns = new ColumnsRepository(db);
    const cards = new CardsService(new CardsRepository(db),columns,new ActivitiesRepository(db),{} as never,{} as never,
      access,new KanbanAuditService(db),new AssigneesRepository(db),
      {recordForActivity:async()=>undefined} as never,{notify:async()=>undefined} as never,new ChecklistGateService(docs),docs,
      visibility,{} as never,{} as never,{} as never,new EntryRequirementsService(db));
    const actor = {identityId:owner,clientId:tenant,databaseRef:TEST_DATABASE_REF,applicationId:randomUUID(),scopes:['flow:read','flow:admin'],roles:['client_admin']};
    const processor = new MovementAutomationService(movements,{} as never,{automationActor:async()=>actor} as never,visibility,cards,
      {broadcastCardMoved:async()=>undefined} as never);
    await processor.execute(TEST_DATABASE_REF,run);
    const stored = await client.query(`SELECT board_column_id FROM kanban_cards WHERE id=$1`,[cardWaiting]);
    assert.equal(stored.rows[0].board_column_id,target);
  });
});
