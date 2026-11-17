import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withTestDatabase, TEST_DATABASE_REF } from '../../../test/with-test-database';
import { MovementAutomationRepository } from './movement-automation.repository';

for(const trigger of ['column_entered','column_left','juridico_process_moved','djen_publication_received','due_date_approaching','card_stale']) {
  void test(`Movement recovery supports ${trigger} and deduplicates source/day`,async()=>{
    await withTestDatabase(async(db,client)=>{
      const tenant=randomUUID(),owner=randomUUID(),board=randomUUID(),source=randomUUID(),target=randomUUID(),card=randomUUID();
      await client.query(`INSERT INTO kanban_boards(id,client_id,name,created_by_identity_id) VALUES($1,$2,'Recovery',$3)`,[board,tenant,owner]);
      await client.query(`INSERT INTO kanban_board_columns(id,client_id,board_id,name,position) VALUES($1,$3,$4,'Source',0),($2,$3,$4,'Target',1)`,[source,target,tenant,board]);
      await client.query(`INSERT INTO kanban_cards(id,client_id,board_id,board_column_id,title,position,created_by_identity_id,due_date,updated_at)
        VALUES($1,$2,$3,$4,'Card',0,$5,CURRENT_DATE+3,NOW()-INTERVAL '10 days')`,[card,tenant,board,trigger==='column_left'?target:source,owner]);
      await client.query(`INSERT INTO kanban_column_automation_rules(client_id,board_id,board_column_id,trigger_type,action_type,action_config,trigger_config,created_by_identity_id)
        VALUES($1,$2,$3,$4,'move_card',$5::jsonb,$6::jsonb,$7)`,[tenant,board,source,trigger,JSON.stringify({toBoardColumnId:target}),JSON.stringify({daysBefore:3,daysStale:7}),owner]);
      await client.query(`INSERT INTO kanban_card_activities(client_id,card_id,type,author_identity_id,event_payload) VALUES($1,$2,'system_event',$3,$4::jsonb)`,
      [tenant,card,owner,JSON.stringify({kind:trigger==='juridico_process_moved'?'juridico_process_changed':trigger==='djen_publication_received'?'djen_publication_received':'card.moved',fromBoardColumnId:source,toBoardColumnId:trigger==='column_left'?target:source})]);
      const repository=new MovementAutomationRepository(db);
      await repository.recover(TEST_DATABASE_REF,tenant);
      await repository.recover(TEST_DATABASE_REF,tenant);
      const run=await repository.claim(TEST_DATABASE_REF,tenant);
      assert.ok(run);
      assert.equal(run.columnId,trigger==='column_left'?target:source);
      assert.equal(await repository.claim(TEST_DATABASE_REF,tenant),null);
      await client.query(`UPDATE kanban_movement_automation_outbox SET updated_at=NOW()-INTERVAL '6 minutes' WHERE id=$1`,[run.id]);
      const recovered=await repository.claim(TEST_DATABASE_REF,tenant);
      assert.ok(recovered);
      assert.notEqual(recovered.claimToken,run.claimToken);
      await client.query(`UPDATE kanban_movement_automation_outbox SET updated_at=NOW()-INTERVAL '6 minutes',attempt_count=5 WHERE id=$1`,[run.id]);
      assert.equal(await repository.claim(TEST_DATABASE_REF,tenant),null);
      assert.equal((await client.query(`SELECT status FROM kanban_movement_automation_outbox WHERE id=$1`,[run.id])).rows[0].status,'failed');
    });
  });
}
