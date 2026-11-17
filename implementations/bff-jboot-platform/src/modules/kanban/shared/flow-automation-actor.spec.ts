import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withTestDatabase } from '../../../test/with-test-database';
import { FlowAdminDirectory } from './flow-admin-directory.service';

void test('Automation actor is revalidated against active tenant membership, application, database ref and entitlement scopes', async () => {
  await withTestDatabase(async (_db,client)=>{
    await client.query(`CREATE TEMP TABLE identities(id uuid,status text) ON COMMIT DROP;
      CREATE TEMP TABLE applications(id uuid,slug text,status text) ON COMMIT DROP;
      CREATE TEMP TABLE memberships(identity_id uuid,client_id uuid,status text) ON COMMIT DROP;
      CREATE TEMP TABLE entitlements(identity_id uuid,client_id uuid,application_id uuid,status text,scopes text[],roles text[]) ON COMMIT DROP;
      CREATE TEMP TABLE database_refs(id uuid,client_id uuid,application_id uuid,status text) ON COMMIT DROP;`);
    const identity=randomUUID(),tenant=randomUUID(),app=randomUUID(),ref=randomUUID();
    await client.query(`INSERT INTO identities VALUES($1,'active')`,[identity]);
    await client.query(`INSERT INTO applications VALUES($1,'flow','active')`,[app]);
    await client.query(`INSERT INTO memberships VALUES($1,$2,'active')`,[identity,tenant]);
    await client.query(`INSERT INTO entitlements VALUES($1,$2,$3,'active',ARRAY['flow:read','flow:write','flow:admin'],ARRAY['client_admin'])`,[identity,tenant,app]);
    await client.query(`INSERT INTO database_refs VALUES($1,$2,$3,'active')`,[ref,tenant,app]);
    const directory=new FlowAdminDirectory({queryIdentity:(sql:string,args:unknown[])=>client.query(sql,args)} as never);
    assert.deepEqual(await directory.automationActor(ref,tenant,identity),{
      identityId:identity,clientId:tenant,applicationId:app,databaseRef:ref,scopes:['flow:read','flow:write','flow:admin'],roles:['client_admin']});
    assert.equal(await directory.automationActor(ref,randomUUID(),identity),null);
    assert.equal(await directory.automationActor(randomUUID(),tenant,identity),null);
    await client.query(`UPDATE memberships SET status='inactive'`);
    assert.equal(await directory.automationActor(ref,tenant,identity),null);
    await client.query(`UPDATE memberships SET status='active'`);
    await client.query(`UPDATE entitlements SET scopes=ARRAY['flow:read','flow:admin']`);
    assert.equal(await directory.automationActor(ref,tenant,identity),null);
  });
});
