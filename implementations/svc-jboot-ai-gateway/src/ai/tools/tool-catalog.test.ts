import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ToolCatalog } from './tool-catalog';

void test('tool catalog resolves only unique closed capabilities', () => {
  const catalog = new ToolCatalog();
  assert.deepEqual(catalog.requireAllowed([]), []);
  const completion = catalog.requireAllowed(['kanban.automation.complete'])[0];
  assert.equal(completion.functionName, 'kanban_automation_complete');
  assert.equal(completion.approvalPolicy, 'automatic');
  assert.deepEqual(completion.inputSchema.required, ['version','status','allTasksCompleted']);
  assert.equal(catalog.requireAllowed(['kanban.card.append_activity'])[0].functionName, 'kanban_card_append_activity');
  assert.throws(() => catalog.requireAllowed(['unknown']), /ai_tool_not_supported/);
  assert.throws(
    () => catalog.requireAllowed(['kanban.card.append_activity', 'kanban.card.append_activity']),
    /ai_tool_duplicate/,
  );
});
