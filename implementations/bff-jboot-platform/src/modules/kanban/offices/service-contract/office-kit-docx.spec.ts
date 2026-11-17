import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDocx, DOCM_MAIN, paragraphXml } from '../../../../test/docx-fixture';
import { analyzeOfficeKitDocx, OfficeKitAnalysisFailure, OfficeKitAnalysisSuccess } from './office-kit-docx';

// Fixtures sinteticas: trechos no formato do kit do escritorio (ADR 019), sem dado de cliente.
const row = (cells: string[]) => `<w:tbl><w:tr>${cells.map((text) => `<w:tc>${paragraphXml(text)}</w:tc>`).join('')}</w:tr></w:tbl>`;
const KIT_BODY = [
  paragraphXml('[[NOME_COMPLETO]], [[NACIONALIDADE]], portador(a) do [[DOCUMENTO_IDENTIDADE]], inscrito(a) no CPF [[CPF]].'),
  paragraphXml('Contra o(a) banco, da(s) instituição(ões) financeira(s); DO(A) OUTORGANTE.'),
  row(['[[BANCO_1]]', '[[CONTRATO_1]]']),
  paragraphXml('[[SE_JEC]]'),
  paragraphXml('Renuncia ao que exceder 40 salarios minimos.'),
  paragraphXml('[[FIM_SE_JEC]]'),
  paragraphXml('[[SE_JEF]]'),
  paragraphXml('Renuncia ao que exceder 60 salarios minimos.'),
  paragraphXml('[[FIM_SE_JEF]]'),
  paragraphXml('Maceio, [[DATA_POR_EXTENSO]]. Valor: 2 (duas) parcelas, bom(boa).')
].join('');

function ok(body: string): OfficeKitAnalysisSuccess {
  const outcome = analyzeOfficeKitDocx(buildDocx({ bodyXml: body }));
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  return outcome as OfficeKitAnalysisSuccess;
}

function rejected(file: Buffer): OfficeKitAnalysisFailure {
  const outcome = analyzeOfficeKitDocx(file);
  assert.equal(outcome.ok, false);
  return outcome as OfficeKitAnalysisFailure;
}

void test('kit: tags em ordem, blocos, linha-molde e marcas de genero/plural', () => {
  const result = ok(KIT_BODY);
  assert.deepEqual(result.tags, [
    'NOME_COMPLETO', 'NACIONALIDADE', 'DOCUMENTO_IDENTIDADE', 'CPF', 'BANCO_1', 'CONTRATO_1',
    'SE_JEC', 'FIM_SE_JEC', 'SE_JEF', 'FIM_SE_JEF', 'DATA_POR_EXTENSO'
  ]);
  assert.deepEqual(result.blocks, ['JEC', 'JEF']);
  assert.deepEqual(result.loanRowTags, ['BANCO_1', 'CONTRATO_1']);
  assert.deepEqual(result.marks.gender.map((item) => item.mark).sort(), ['DO(A)', 'inscrito(a)', 'o(a)', 'portador(a)']);
  assert.deepEqual(result.marks.plural.map((item) => item.mark).sort(), ['da(s)', 'financeira(s)', 'instituição(ões)']);
  assert.deepEqual(result.marks.unrecognized, [{ mark: 'bom(boa)', count: 1 }], '"2 (duas)" nao e marca: tem espaco antes');
  assert.deepEqual(result.warnings, []);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
});

void test('kit: tag com formatacao no meio continua detectada e a mal escrita vira aviso', () => {
  const split = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>[[NOME_</w:t></w:r><w:r><w:t>COMPLETO]] e [[nome completo]]</w:t></w:r></w:p>';
  const result = ok(split + row(['[[BANCO_1]]']));
  assert.deepEqual(result.tags, ['NOME_COMPLETO', 'BANCO_1']);
  assert.deepEqual(result.invalidTags, ['[[nome completo]]']);
  assert.deepEqual(result.warnings.map((item) => item.code), ['waiver_text_missing']);
});

void test('kit: blocos abertos sem fechar, fechados sem abrir ou aninhados sao recusados', () => {
  assert.equal(rejected(buildDocx({ paragraphs: ['[[CPF]]', '[[SE_JEC]]', 'texto'] })).code, 'service_contract_block_unbalanced');
  assert.equal(rejected(buildDocx({ paragraphs: ['[[CPF]]', '[[FIM_SE_JEC]]'] })).code, 'service_contract_block_unbalanced');
  const nested = rejected(buildDocx({ paragraphs: ['[[SE_JEC]]', '[[SE_JEF]]', '[[FIM_SE_JEF]]', '[[FIM_SE_JEC]]'] }));
  assert.equal(nested.code, 'service_contract_block_nested');
  assert.equal(nested.details.tag, '[[SE_JEF]]');
});

void test('kit: tag _1 de contrato fora de linha de tabela e recusada; linha _2 fixa do modelo e aceita', () => {
  const outside = rejected(buildDocx({ bodyXml: row(['[[BANCO_1]]']) + paragraphXml('Banco [[BANCO_1]]') }));
  assert.equal(outside.code, 'service_contract_loan_row_outside_table');
  assert.equal(outside.details.tag, '[[BANCO_1]]');
  const extra = ok(row(['[[BANCO_1]]']) + row(['[[BANCO_2]]']) + paragraphXml('[[SE_JEC]] [[FIM_SE_JEC]] [[SE_JEF]] [[FIM_SE_JEF]]'));
  assert.deepEqual(extra.warnings, [], 'o Flow tira a linha _2 na montagem');
});

void test('kit validado do escritorio: renuncia sem blocos e aceita e a Declaracao de Residencia sai das tags', () => {
  const body =
    paragraphXml('[[NOME_COMPLETO]], para fins de ajuizamento perante o Juizado Especial Cível, RENUNCIA expressamente ao crédito que exceder 40 salários.') +
    row(['[[BANCO_1]]']) +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    paragraphXml('DECLARAÇÃO DE RESIDÊNCIA') +
    paragraphXml('Comprovante [[TIPO_COMPROVANTE]] em nome de [[NOME_TITULAR_COMPROVANTE]].');
  const result = ok(body);
  assert.deepEqual(result.tags, ['NOME_COMPLETO', 'BANCO_1']);
  assert.deepEqual(result.warnings.map((item) => item.code), ['residence_declaration_removed']);
});

void test('kit: sem tag, com macro ou que nao e Word e recusado', () => {
  assert.equal(rejected(buildDocx({ paragraphs: ['Contrato sem campos'] })).code, 'service_contract_no_tags');
  assert.equal(rejected(buildDocx({ paragraphs: ['[[CPF]]'], mainContentType: DOCM_MAIN })).code, 'template_macro_forbidden');
  assert.equal(rejected(Buffer.from('nao e zip')).ok, false);
});
