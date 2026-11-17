import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';

void test('Movement rule accepts only a distinct active destination in the authenticated board and no recipient', async () => {
  const writes: unknown[]=[];
  const context={databaseRef:'db',clientId:'tenant',identityId:'owner',applicationId:'flow',scopes:['flow:admin'],roles:[]};
  const service=new AutomationRulesService({create:async(...args:unknown[])=>{writes.push(args); return {id:'rule'};}} as never,
    {findById:async(_db:string,tenant:string,board:string,id:string)=>
      tenant==='tenant'&&board==='board'&&['source','destination','archived'].includes(id)?{id,status:id==='archived'?'archived':'active'}:null} as never,
    {} as never,{requireBoard:async()=>({}),requireRole:async()=> 'board_admin'} as never,{record:async()=>undefined} as never);
  const valid={triggerType:'ai_completed' as const,actionType:'move_card' as const,actionConfig:{toBoardColumnId:'destination'}};
  await service.create(context,'board','source',valid,context);
  assert.equal(writes.length,1);
  for(const destination of ['source','other-tenant-column','archived','']) {
    await assert.rejects(()=>service.create(context,'board','source',{...valid,actionConfig:{toBoardColumnId:destination}},context),BadRequestException);
  }
  await assert.rejects(()=>service.create(context,'board','source',{...valid,recipientRole:'creator'},context),BadRequestException);
  await assert.rejects(()=>service.create(context,'board','source',{...valid,actionType:'execute_ai_agent'},context),BadRequestException);
  assert.equal(writes.length,1,'rejected combinations never persist');
});
