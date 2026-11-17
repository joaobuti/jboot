import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { ExecutionMaterial, ExecutionRepository } from './execution.repository';

void test('PostgreSQL serializes owner reservations, enforces limits and stores unknown cost as NULL', async () => {
  const db = new DatabaseService(new AppConfigService());
  const repo = new ExecutionRepository(db);
  const clientId = randomUUID(), owner = randomUUID(), credential = randomUUID(), agent = randomUUID();
  try {
    await db.query("INSERT INTO ai_credentials(id,client_id,owner_identity_id,provider,last4,status,encryption_key_version) VALUES($1,$2,$3,'anthropic','unit','revoked',1)", [credential, clientId, owner]);
    await db.query("INSERT INTO ai_agents(id,client_id,owner_identity_id,application_slug,credential_id,provider,name,model) VALUES($1,$2,$3,'flow',$4,'anthropic','Unit','unit-model')", [agent, clientId, owner, credential]);
    const material = { agentId: agent, agentVersion: 1, provider: 'anthropic', model: 'unit-model' } as ExecutionMaterial;
    const create = (key: string) => repo.create({ id: randomUUID(), clientId, requesterId: owner, applicationSlug: 'flow', sourceType: 'unit', sourceId: randomUUID(), idempotencyKey: key, inputSha256: 'a'.repeat(64), material });
    const parallel = await Promise.allSettled([create('one'), create('two'), create('three')]);
    assert.equal(parallel.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(parallel.filter(result => result.status === 'rejected').length, 1);
    const first = parallel.find(result => result.status === 'fulfilled');
    assert.ok(first?.status === 'fulfilled' && first.value);
    const completed = await repo.succeed(first.value.id, 'b'.repeat(64), 25, 10, 5);
    assert.equal(completed.estimatedCost, null);
    await db.query("UPDATE ai_executions SET status='failed' WHERE client_id=$1", [clientId]);
    for (let count = 2; count < 20; count++) {
      const row = await create(`daily-${count}`);
      assert.ok(row);
      await repo.fail(row.id, 'unit', 1);
    }
    await assert.rejects(() => create('over-limit'), /ai_execution_quota_exceeded/);
    // Modo rotina: o banco recusa URL fora da Anthropic, URL ausente ou token ausente.
    const routineInsert = (url: string | null, token: Buffer | null) => db.query(
      "INSERT INTO ai_agents(client_id,owner_identity_id,application_slug,provider,name,execution_mode,routine_fire_url,routine_token_ciphertext,routine_token_nonce,routine_token_auth_tag,routine_token_key_version,routine_token_last4) VALUES($1,$2,'flow','claude_routine','Rotina','claude_routine',$3,$4,$4,$4,CASE WHEN $4::bytea IS NULL THEN NULL ELSE 1 END,CASE WHEN $4::bytea IS NULL THEN NULL ELSE '0000' END)",
      [clientId, owner, url, token]);
    await assert.rejects(() => routineInsert('https://attacker.example/fire', Buffer.alloc(1)), /ai_agents_execution_mode_fields/);
    await assert.rejects(() => routineInsert(null, Buffer.alloc(1)), /ai_agents_execution_mode_fields/);
    await assert.rejects(() => routineInsert('https://api.anthropic.com/v1/claude_code/routines/trig_1/fire', null), /ai_agents_execution_mode_fields/);
  } finally {
    await db.query('DELETE FROM ai_executions WHERE client_id=$1', [clientId]);
    await db.query('DELETE FROM ai_agents WHERE client_id=$1', [clientId]);
    await db.query('DELETE FROM ai_credentials WHERE client_id=$1', [clientId]);
    await db.onModuleDestroy();
  }
});
