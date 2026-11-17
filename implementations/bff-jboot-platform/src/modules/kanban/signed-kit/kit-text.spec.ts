import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDocx } from '../../../test/docx-fixture';
import { KIT_TEXT_PART_CHARS, kitTextPart, officeKitText } from './kit-text';

void test('texto do kit: um paragrafo por linha, entidades decodificadas', () => {
  const docx = buildDocx({ paragraphs: ['CONTRATO DE HONORÁRIOS', 'Cliente: MARIA & FILHOS', '', 'Assinatura: ________________'] });
  assert.equal(officeKitText(docx), 'CONTRATO DE HONORÁRIOS\nCliente: MARIA & FILHOS\n\nAssinatura: ________________');
});

void test('texto do kit em partes: corta em quebra de linha e devolve a contagem', () => {
  const line = 'x'.repeat(1000);
  const text = Array.from({ length: 30 }, () => line).join('\n');
  const first = kitTextPart(text, 1);
  assert.ok(first.partCount >= 3);
  assert.ok(first.text.length <= KIT_TEXT_PART_CHARS);
  assert.equal(first.text.endsWith('x'), true);
  const joined = Array.from({ length: first.partCount }, (_, i) => kitTextPart(text, i + 1).text).join('\n');
  assert.equal(joined, text, 'as partes juntas reproduzem o texto');
  assert.equal(kitTextPart(text, 99).part, first.partCount, 'parte alem do fim devolve a ultima');
  assert.deepEqual(kitTextPart('curto', 1), { part: 1, partCount: 1, text: 'curto' });
});
