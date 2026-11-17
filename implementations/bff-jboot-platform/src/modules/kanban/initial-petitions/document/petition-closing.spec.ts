import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import PizZip from 'pizzip';
import { closingProblems, petitionClosingLines } from './petition-closing';
import { buildPetitionDocx } from './petition-docx';
import { samplePetition } from './petition-fixture';

const signer = { identityId: 'adv', name: 'Maria da Silva', oabNumber: '12345', oabUf: 'AM' as const };

void test('fecho do Flow: local do escritorio, data da geracao por extenso, nome em negrito e OAB da UF', () => {
  assert.deepEqual(petitionClosingLines({ place: { city: 'Manaus', uf: 'AM' }, signer, gaps: [] }, '2026-10-29'), [
    { text: 'Nesses termos,' },
    { text: 'pede deferimento.' },
    { text: 'Manaus/AM, 29 de outubro de 2026.' },
    { text: 'Maria da Silva', bold: true },
    { text: 'OAB/AM nº 12345' }
  ]);
  assert.equal(petitionClosingLines({ place: null, signer, gaps: [] }, '2026-11-01')[2].text, 'XXXX/XXXX, 1º de novembro de 2026.');
  const missing = petitionClosingLines({ place: { city: 'Manaus', uf: 'AM' }, signer: null, gaps: [] }, '2026-10-29');
  assert.deepEqual(missing.slice(3), [{ text: 'XXXX', bold: true }, { text: 'OAB/XXXX nº XXXX' }]);
});

void test('envio com o fecho e recusado com orientacao; "nos termos dos arts." nao e fecho', () => {
  assert.deepEqual(closingProblems(samplePetition()), []);
  const withClosing = samplePetition();
  withClosing.body.push(
    { type: 'paragraph', runs: [{ text: 'Nesses termos,' }] },
    { type: 'paragraph', runs: [{ text: 'pede ' }, { text: 'deferimento.' }] },
    { type: 'paragraph', runs: [{ text: 'OAB/AM nº XXXX' }] }
  );
  const problems = closingProblems(withClosing);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /montado pelo Flow/);
  assert.match(problems[1], /"pede deferimento"/, 'trechos do mesmo paragrafo sao lidos juntos');
  assert.match(problems[2], /OAB\/UF/);
});

void test('docx: fecho depois do corpo e antes da memoria de calculo, sem recuo, com XXXX realcado', async () => {
  const content = samplePetition();
  content.body = content.body.filter((block) => block.type !== 'figure');
  const lines = petitionClosingLines({ place: null, signer, gaps: [] }, '2026-10-29');
  const document = new PizZip((await buildPetitionDocx(content, new Map(), lines)).file).file('word/document.xml')?.asText() ?? '';
  const closingAt = document.indexOf('Nesses termos,');
  assert.ok(closingAt > 0);
  assert.ok(closingAt < document.indexOf('MEMÓRIA DE CÁLCULO DO VALOR DA CAUSA'), 'antes da memoria de calculo');
  assert.match(document, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">XXXX<\/w:t>/);
  assert.match(document, /<w:b\/>[\s\S]{0,200}Maria da Silva/);
  assert.match(document, /OAB\/AM nº 12345/);
});
