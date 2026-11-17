import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUTOMATION_COMPLETION, isAutomationCompletion } from './automation-completion';

void test('Completion eval: only exact structured integral success is accepted', () => {
  assert.equal(isAutomationCompletion(AUTOMATION_COMPLETION),true);
  for(const data of [null,[],true,'concluido com sucesso',{...AUTOMATION_COMPLETION,version:2},
    {...AUTOMATION_COMPLETION,allTasksCompleted:false},{...AUTOMATION_COMPLETION,status:'partial'},
    {...AUTOMATION_COMPLETION,moveTo:'injected'},{status:'succeeded'}]) {
    assert.equal(isAutomationCompletion(data),false,JSON.stringify(data));
  }
});
