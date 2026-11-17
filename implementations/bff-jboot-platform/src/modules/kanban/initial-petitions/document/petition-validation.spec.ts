import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { petitionContentSchema } from './petition-content';
import { samplePetition } from './petition-fixture';
import { fileToken, petitionFileName, textProblems, validatePetitionContent } from './petition-validation';

const options = { figureIds: new Set(['print-1']), today: '2026-10-28' };

void test('a peca de exemplo passa no esquema e nas recusas', () => {
  assert.equal(petitionContentSchema.safeParse(samplePetition()).success, true);
  assert.deepEqual(validatePetitionContent(samplePetition(), options), []);
});

void test('recusas do texto: travessao, "(a)", chaves, "nao informado" e ponto duplo; ementa isenta de travessao e "(a)"', () => {
  assert.equal(textProblems('O Autor — aposentado').length, 1);
  assert.equal(textProblems('notificado(a)').length, 1);
  assert.equal(textProblems('valor {VALOR}').length, 1);
  assert.equal(textProblems('CEP Não Informado').length, 1);
  assert.equal(textProblems('BANCO PAN S.A..').length, 1);
  assert.deepEqual(textProblems('cortes (...) e reticencias... ficam'), []);
  assert.deepEqual(textProblems('Tema 183 – hipotese I'), [], 'meia-risca (en dash) do texto literal da TNU nao e travessao');
  assert.deepEqual(textProblems('EMENTA — o(a) autor(a)', true), []);
  assert.equal(textProblems('EMENTA {x}', true).length, 1, 'chave vale tambem na ementa');
});

void test('estrutura: nota sem URL ou no futuro, ementa sem nota, figura nao recortada, colunas e topicos', () => {
  const base = samplePetition();
  const errors = validatePetitionContent(
    {
      ...base,
      body: [
        { type: 'paragraph', runs: [{ text: 'Art. 42 do CDC', footnote: { url: 'pesquisar pelo numero', accessedAt: '2026-11-01' } }] },
        { type: 'quote', runs: [{ text: 'EMENTA sem link' }] },
        { type: 'figure', figureId: 'print-9', caption: 'Figura 2.' },
        { type: 'table', header: ['A', 'B'], rows: [['1']], totalRow: ['x'] }
      ]
    },
    options
  );
  assert.deepEqual(errors, [
    'Bloco 1 (paragrafo): nota de rodape sem URL http(s) valida.',
    'Bloco 1 (paragrafo): nota de rodape com data de acesso no futuro.',
    'Bloco 2 (ementa): a ementa precisa da nota de rodape com o link do acordao.',
    'Bloco 3 (figura): print "print-9" nao foi recortado nesta execucao.',
    'Bloco 4 (tabela), linha 1: 1 colunas, o cabecalho tem 2.',
    'Bloco 4 (tabela), linha de total: colunas diferentes do cabecalho.',
    'A peca precisa de topicos (I. GRATUIDADE DA JUSTICA., II. FATOS. ...).'
  ]);
  const calc = validatePetitionContent({ ...base, calculation: { ...base.calculation, total: 'R$ 1.000,00 — simples' } }, options);
  assert.deepEqual(calc, ['Memoria de calculo (total e valor da causa): travessao "—" (use virgula, ponto ou dois-pontos).']);
});

void test('nome do arquivo: Inicial_[JEC|JEF]_[Banco]_[PrimeiroNome].docx sem acento nem espaco', () => {
  assert.equal(petitionFileName(samplePetition()), 'Inicial_JEC_Santander_Sergio.docx');
  assert.equal(petitionFileName({ court: 'jef', fileBank: 'BMG RMC', clientFirstName: 'Algemiro' }), 'Inicial_JEF_BMGRMC_Algemiro.docx');
  assert.equal(petitionFileName({ court: 'jef', fileBank: 'BMG_RMC', clientFirstName: 'Algemiro' }), 'Inicial_JEF_BMG_RMC_Algemiro.docx');
  assert.equal(fileToken('../../etc'), 'etc');
  assert.deepEqual(validatePetitionContent(samplePetition({ clientFirstName: '***' }), options), ['Nome do arquivo (primeiro nome): use letras.']);
});
