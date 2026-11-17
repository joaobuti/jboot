import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isAcceptedKitTag, normalizeKitTagValues, normalizeNotes, routineKitTags } from './kit-tag-values';

const MODEL = ['NOME_COMPLETO', 'BANCO_1', 'CONTRATO_1', 'INICIO_1', 'DATA_POR_EXTENSO', 'LISTA_BANCOS', 'SE_JEF', 'FIM_SE_JEF'];

void test('tags da rotina: sem blocos e sem as calculadas pelo Flow', () => {
  assert.deepEqual(routineKitTags(MODEL), ['NOME_COMPLETO', 'BANCO_1', 'CONTRATO_1', 'INICIO_1']);
});

void test('emprestimo _n so e aceito quando a linha-molde _1 esta no modelo', () => {
  assert.equal(isAcceptedKitTag('BANCO_7', MODEL), true);
  assert.equal(isAcceptedKitTag('VALOR_2', MODEL), false, 'modelo sem VALOR_1');
  assert.equal(isAcceptedKitTag('BANCO_0', MODEL), false);
  assert.equal(isAcceptedKitTag('SE_JEF', MODEL), false, 'tag de bloco nunca recebe valor');
  assert.equal(isAcceptedKitTag('nome_completo', MODEL), false);
});

void test('valores: espacos colapsados, vazio omitido, longo e fora do modelo descartados', () => {
  const result = normalizeKitTagValues(
    { NOME_COMPLETO: '  JOAO   DA  SILVA ', BANCO_1: '', CONTRATO_1: 'x'.repeat(501), OUTRA: 'y', INICIO_1: 42 },
    MODEL
  );
  assert.deepEqual(result.values, { NOME_COMPLETO: 'JOAO DA SILVA' });
  assert.deepEqual(result.discarded.sort(), ['CONTRATO_1', 'INICIO_1', 'OUTRA']);
});

void test('notas: so texto, limpo e com teto', () => {
  assert.deepEqual(normalizeNotes(['  a  ', '', 3, 'b', 'c'], 2), ['a', 'b']);
  assert.deepEqual(normalizeNotes('x', 5), []);
});

void test('valores alem do teto nao somem em silencio: overflow conta o excesso', () => {
  const many: Record<string, string> = {};
  for (let i = 0; i < 1003; i += 1) many[`BANCO_${i + 1}`] = 'X';
  const result = normalizeKitTagValues(many, ['BANCO_1']);
  assert.equal(result.overflow, 3);
  assert.equal(result.values.BANCO_999, 'X', 'emprestimo _999 e aceito pela linha-molde');
  assert.equal(Object.keys(result.values).length, 999, 'BANCO_1000 nao e numeracao de emprestimo e e descartado');
});
