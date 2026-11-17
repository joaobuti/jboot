import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import PizZip from 'pizzip';
import { buildDocx, paragraphXml } from '../../../../test/docx-fixture';
import { inspectDocxPackage } from '../../document-templates/docx-package';
import { dateInFull, mergeSplitTokens, OfficeKitRenderInput, OfficeKitRenderSuccess, renderOfficeKitDocx } from './office-kit-render';

// Fixtures sinteticas no formato do kit do escritorio (ADR 019), sem dado de cliente real.
const cell = (text: string) => `<w:tc>${paragraphXml(text)}</w:tc>`;
const table = (cells: string[]) => `<w:tbl><w:tr>${cells.map(cell).join('')}</w:tr></w:tbl>`;
const KIT = [
  paragraphXml('[[NOME_COMPLETO]], [[NACIONALIDADE]], portador(a) do [[DOCUMENTO_IDENTIDADE]], inscrito(a) no CPF [[CPF]], DO(A) OUTORGANTE.'),
  paragraphXml('Contra a(s) instituição(ões) financeira(s) [[LISTA_BANCOS]], pelo(s) contrato(s) e empréstimo(s) abaixo; bom(boa).'),
  table(['[[BANCO_1]]', '[[CONTRATO_1]]', '[[VALOR_1]]']),
  paragraphXml('[[SE_JEC]]'),
  paragraphXml('Renuncia ao que exceder 40 salarios minimos.'),
  paragraphXml('[[FIM_SE_JEC]]'),
  paragraphXml('[[SE_JEF]]'),
  paragraphXml('Renuncia ao que exceder 60 salarios minimos.'),
  paragraphXml('[[FIM_SE_JEF]]'),
  paragraphXml('Maceio, [[DATA_POR_EXTENSO]]. Profissao: [[PROFISSAO]].')
].join('');

const BASE: OfficeKitRenderInput = {
  values: {
    NOME_COMPLETO: 'MARIA DA SILVA',
    NACIONALIDADE: 'brasileira',
    DOCUMENTO_IDENTIDADE: 'RG nº 000.000-0 SSP/AL',
    CPF: '000.000.000-00',
    BANCO_1: 'Banco A',
    CONTRATO_1: '111',
    VALOR_1: 'R$ 1.000,00',
    BANCO_2: 'Banco A',
    CONTRATO_2: '222',
    BANCO_3: 'Banco B & Cia',
    CONTRATO_3: '333'
  },
  gender: 'feminino',
  waiverCourt: 'jef',
  generatedAt: '2026-10-28T15:00:00.000Z'
};

function render(body: string, input: OfficeKitRenderInput = BASE): { text: string; xml: string; result: OfficeKitRenderSuccess } {
  const outcome = renderOfficeKitDocx(buildDocx({ bodyXml: body }), input);
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  const result = outcome as OfficeKitRenderSuccess;
  const zip = new PizZip(Buffer.from(result.file));
  const xml = zip.file('word/document.xml')!.asText();
  const text = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n');
  return { text, xml, result };
}

void test('kit: substitui tags, repete a linha-molde por contrato e calcula lista de bancos e data', () => {
  const { text, xml, result } = render(KIT);
  assert.match(text, /^MARIA DA SILVA, brasileira, portadora do RG nº 000.000-0 SSP\/AL, inscrita no CPF 000.000.000-00, DA OUTORGANTE\.$/m);
  assert.equal((xml.match(/<w:tr>/g) ?? []).length, 3, 'uma linha por contrato');
  assert.deepEqual(text.split('\n').slice(2, 11), ['Banco A', '111', 'R$ 1.000,00', 'Banco A', '222', '[[VALOR_2]]', 'Banco B &amp; Cia', '333', '[[VALOR_3]]']);
  assert.match(text, /\[\[LISTA_BANCOS\]\]|Banco A e Banco B &amp; Cia/);
  assert.match(text, /Banco A e Banco B &amp; Cia/);
  assert.match(text, /Maceio, 28 de outubro de 2026\./);
  assert.deepEqual(result.report.emptyTags.sort(), ['PROFISSAO', 'VALOR_2', 'VALOR_3']);
  assert.equal(result.report.contracts, 3);
  assert.equal(result.report.institutions, 2);
  inspectDocxPackage(new Map(Object.entries(new PizZip(Buffer.from(result.file)).files).map(([name, entry]) => [name, Buffer.from(entry.asUint8Array())])));
});

void test('kit: plural por palavra (contratos x instituicoes) e marca nao reconhecida mantida', () => {
  const { text, result } = render(KIT);
  // 3 contratos e 2 instituicoes: tudo no plural.
  assert.match(text, /Contra as instituições financeiras Banco A e Banco B &amp; Cia, pelos contratos e empréstimos abaixo; bom\(boa\)\./);
  assert.deepEqual(result.report.unresolvedMarks, ['bom(boa)']);
  // 1 instituicao e 2 contratos: instituicao no singular, contratos no plural.
  const oneBank = render(KIT, { ...BASE, values: { ...BASE.values, BANCO_3: 'Banco A' } });
  assert.match(oneBank.text, /Contra a instituição financeira Banco A, pelos contratos e empréstimos abaixo/);
});

void test('kit: masculino tira as marcas; sem genero as marcas ficam como estao', () => {
  const male = render(KIT, { ...BASE, gender: 'masculino' });
  assert.match(male.text, /portador do RG .*inscrito no CPF .*DO OUTORGANTE\./);
  const unknown = render(KIT, { ...BASE, gender: null });
  assert.match(unknown.text, /portador\(a\) do RG/);
  assert.ok(unknown.result.report.unresolvedMarks.includes('portador(a)'));
});

void test('kit: mantem so o bloco escolhido e tira os marcadores', () => {
  const jef = render(KIT).text;
  assert.match(jef, /60 salarios/);
  assert.doesNotMatch(jef, /40 salarios|SE_JE[CF]/);
  const jec = render(KIT, { ...BASE, waiverCourt: 'jec' }).text;
  assert.match(jec, /40 salarios/);
  assert.doesNotMatch(jec, /60 salarios|SE_JE[CF]/);
});

void test('kit: tag e marca divididas pelo Word em varios runs sao resolvidas', () => {
  const split =
    '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>[[NOME_</w:t></w:r><w:r><w:t>COMPLETO]] porta</w:t></w:r>' +
    '<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>dor(</w:t></w:r><w:r><w:t>a)</w:t></w:r></w:p>';
  const merged = mergeSplitTokens(split);
  // A tag fica no run em negrito; a marca inteira vai para o run onde ela comeca.
  assert.match(merged, /<w:b\/><\/w:rPr><w:t xml:space="preserve">\[\[NOME_COMPLETO\]\]<\/w:t>/);
  assert.match(merged, /<w:t xml:space="preserve"> portador\(a\)<\/w:t><\/w:r><w:r><w:rPr><w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve"><\/w:t>/);
  const { text } = render(split + table(['[[BANCO_1]]']));
  assert.equal(text.split('\n')[0], 'MARIA DA SILVA portadora');
});

void test('kit: sem contratos a linha-molde fica uma vez com as tags visiveis', () => {
  const { text, result } = render(KIT, { ...BASE, values: { NOME_COMPLETO: 'JOAO' } });
  assert.match(text, /\[\[BANCO_1\]\]\n\[\[CONTRATO_1\]\]/);
  assert.match(text, /\[\[LISTA_BANCOS\]\]/, 'sem banco a lista fica para o advogado');
  assert.ok(result.report.emptyTags.includes('LISTA_BANCOS'));
  assert.match(text, /a\(s\) instituição\(ões\) financeira\(s\)/, 'sem instituicao o plural fica como esta');
});

// Trechos no formato do KIT_MODELO_AM validado pelo escritorio (estrutura, nao dado de cliente).
const AM_TABLE =
  '<w:tbl><w:tr><w:tc>' + paragraphXml('Nº') + '</w:tc><w:tc>' + paragraphXml('Instituição financeira') + '</w:tc></w:tr>' +
  '<w:tr><w:tc>' + paragraphXml('1') + '</w:tc><w:tc><w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>[[BANCO_1]]</w:t></w:r></w:p></w:tc></w:tr>' +
  '<w:tr><w:tc>' + paragraphXml('2') + '</w:tc><w:tc>' + paragraphXml('[[BANCO_2]]') + '</w:tc></w:tr></w:tbl>';
const AM_WAIVER =
  '<w:p><w:r><w:t xml:space="preserve">[[NOME_COMPLETO]], perante o Juizado Especial Cível, </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>RENUNCIA</w:t></w:r>' +
  '<w:r><w:t xml:space="preserve"> expressamente ao crédito que exceder o limite de 40 (quarenta) salários mínimos, nos termos do art. 3º da Lei nº 9.099/1995.</w:t></w:r></w:p>';
const AM_DECLARATION =
  '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + paragraphXml('DECLARAÇÃO DE RESIDÊNCIA') + paragraphXml('Em nome de [[NOME_TITULAR_COMPROVANTE]], seu/sua [[VINCULO_COM_TITULAR]].');

void test('kit validado: linha _2 fixa sai, numeracao acompanha os contratos e o destaque sai do valor', () => {
  const { text, xml } = render(AM_TABLE);
  assert.deepEqual(text.split('\n'), ['Nº', 'Instituição financeira', '1', 'Banco A', '2', 'Banco A', '3', 'Banco B &amp; Cia']);
  assert.equal(xml.includes('w:highlight'), false, 'valor preenchido sai sem o destaque amarelo do modelo');
  const empty = render(AM_TABLE, { ...BASE, values: {} });
  assert.match(empty.xml, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t>\[\[BANCO_1\]\]/, 'tag sem valor continua destacada');
});

void test('kit validado: JEF troca o trecho da renuncia; JEC mantem o modelo; Declaracao de Residencia sai', () => {
  const jef = render(AM_WAIVER + AM_DECLARATION);
  assert.equal(
    jef.text,
    'MARIA DA SILVA, perante o Juizado Especial Federal, RENUNCIA expressamente ao valor que, somadas as parcelas vencidas e 12 (doze) vincendas, exceder 60 (sessenta) salários mínimos na data da propositura da ação, nos termos do art. 3º da Lei nº 10.259/2001.'
  );
  assert.match(jef.xml, /<w:b\/><\/w:rPr><w:t[^>]*>RENUNCIA<\/w:t>/, 'o RENUNCIA em negrito continua no proprio run');
  assert.deepEqual(jef.result.report.emptyTags, [], 'tags da Declaracao nao contam: a secao saiu');
  const jec = render(AM_WAIVER + AM_DECLARATION, { ...BASE, waiverCourt: 'jec' });
  assert.match(jec.text, /Juizado Especial Cível, RENUNCIA expressamente ao crédito que exceder o limite de 40/);
  assert.doesNotMatch(jec.text, /DECLARAÇÃO DE RESIDÊNCIA/);
  assert.equal(jec.xml.includes('w:type="page"'), false, 'a quebra de pagina da Declaracao sai junto');
  const noText = render(paragraphXml('[[NOME_COMPLETO]]'));
  assert.deepEqual(noText.result.report.warnings.map((item) => item.code), ['waiver_jef_not_applied']);
});

void test('kit: data por extenso no fuso de Brasilia', () => {
  assert.equal(dateInFull('2026-10-29T02:30:00.000Z'), '28 de outubro de 2026');
  assert.equal(dateInFull('2026-01-05T12:00:00.000Z'), '5 de janeiro de 2026');
});
