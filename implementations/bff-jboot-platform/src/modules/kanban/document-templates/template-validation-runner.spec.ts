import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDocx } from '../../../test/docx-fixture';
import { DEFAULT_VALIDATION_RUNNER_OPTIONS, TemplateValidationRunner } from './template-validation-runner.service';

void test('runner: valida em worker thread e devolve o mesmo resultado estruturado', async () => {
  const runner = new TemplateValidationRunner();
  const valid = await runner.validate(buildDocx({ paragraphs: ['{{cliente.nome}}'] }));
  assert.equal(valid.ok, true);
  assert.equal(valid.ok && valid.status, 'valid');
  const raw = await runner.validate(buildDocx({ paragraphs: ['{{@x}}'] }));
  assert.equal(!raw.ok && raw.code, 'template_raw_xml_forbidden');
});

void test('runner: timeout recusa (falha fechada) e concorrencia limitada nao perde chamadas', async () => {
  const slow = new TemplateValidationRunner({ ...DEFAULT_VALIDATION_RUNNER_OPTIONS, timeoutMs: 1 });
  const outcome = await slow.validate(buildDocx());
  assert.equal(!outcome.ok && outcome.code, 'template_validation_timeout');

  const serial = new TemplateValidationRunner({ ...DEFAULT_VALIDATION_RUNNER_OPTIONS, maxConcurrent: 1 });
  const results = await Promise.all([1, 2, 3].map(() => serial.validate(buildDocx({ paragraphs: ['{{data.hoje}}'] }))));
  assert.deepEqual(results.map((result) => result.ok), [true, true, true]);
});
