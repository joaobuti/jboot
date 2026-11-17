import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MovementAutomationService } from './movement-automation.service';

void test('Movement scheduler isolates tenant failures and bounds each recovery batch',async()=>{
  const calls:string[]=[];
  const service=new MovementAutomationService({
    recover:async(_db:string,tenant:string)=>{calls.push(`recover:${tenant}`);if(tenant==='bad')throw new Error('unavailable');},
    claim:async()=>({id:'run'})
  } as never,{listActiveFlowTenants:async()=>[{databaseRef:'db',clientId:'bad'},{databaseRef:'db',clientId:'good'}]} as never,
  {} as never,{} as never,{} as never,{} as never);
  service.execute=async()=>{calls.push('execute');};
  await service.recoverAndExecute();
  assert.deepEqual(calls.slice(0,2),['recover:bad','recover:good']);
  assert.equal(calls.filter(call=>call==='execute').length,100);
});
