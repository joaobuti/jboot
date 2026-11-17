import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DeadlineService } from './deadline.service';
const ctx={clientId:'client',databaseRef:'ref',identityId:'identity',applicationId:'app',scopes:['juridico:write'],roles:[]};
void test('calcula dias uteis excluindo fim de semana e feriado nacional',async()=>{let saved: {resultDate:string;memory:{skipped:string[]}}|undefined;const repo={holidays:async()=>['2026-01-01'],saveCalculation:async(_a:string,_b:string,_c:string,value:{resultDate:string;memory:{skipped:string[]}})=>{saved=value;return value;}};const s=new DeadlineService(repo as never);const result=await s.calculate(ctx,{startDate:'2025-12-31',businessDays:2,includeStart:false});assert.equal(result.resultDate,'2026-01-05');assert.deepEqual(saved?.memory.skipped,['2026-01-01','2026-01-03','2026-01-04']);});
