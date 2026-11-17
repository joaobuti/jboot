import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createCanvas } from '@napi-rs/canvas';
import PizZip from 'pizzip';
import { buildPetitionDocx, footnoteText, PetitionFigure, splitPending } from './petition-docx';
import { samplePetition } from './petition-fixture';

async function figure(): Promise<PetitionFigure> {
  const canvas = createCanvas(1200, 300);
  canvas.getContext('2d').fillRect(0, 0, 1200, 300);
  return { png: await canvas.encode('png'), width: 1200, height: 300 };
}

async function unpack() {
  const built = await buildPetitionDocx(samplePetition(), new Map([['print-1', await figure()]]));
  const zip = new PizZip(built.file);
  const read = (name: string) => zip.file(name)?.asText() ?? '';
  return { built, zip, document: read('word/document.xml'), styles: read('word/styles.xml'), footnotes: read('word/footnotes.xml') };
}

void test('nota de rodape no padrao do prompt e XXXX separado para o realce', () => {
  assert.equal(footnoteText('https://x.gov.br/l.htm', '2026-09-30'), 'Disponível em: <https://x.gov.br/l.htm>. Acesso em: 30 set. 2026.');
  assert.equal(footnoteText('https://x.gov.br', '2026-05-03'), 'Disponível em: <https://x.gov.br>. Acesso em: 3 maio 2026.');
  assert.deepEqual(splitPending('RG nº XXXX SSP'), [{ text: 'RG nº ', pending: false }, { text: 'XXXX', pending: true }, { text: ' SSP', pending: false }]);
});

void test('docx: A4, margens 3/3/2/2 cm, Bookman 11, recuo de 3 cm, ementa 4 cm fonte 10, titulos com manter com o proximo', async () => {
  const { built, document, styles } = await unpack();
  assert.equal(built.fileName, 'Inicial_JEC_Santander_Sergio.docx');
  assert.match(document, /<w:pgSz w:w="11906" w:h="16838"/);
  assert.match(document, /<w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701"/);
  assert.match(styles, /w:ascii="Bookman Old Style"/);
  assert.match(styles, /<w:sz w:val="22"\/>/);
  assert.match(document, /<w:ind w:firstLine="1701"\/>/);
  assert.match(document, /<w:ind w:left="2268"\/>/);
  assert.match(document, /<w:sz w:val="20"\/>/, 'ementa em 10 pt');
  assert.match(document, /<w:keepNext\/>/);
  assert.match(document, /PRIORIDADE DE TRAMITAÇÃO: PESSOA IDOSA/);
  assert.match(document, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">XXXX<\/w:t>/);
  assert.doesNotMatch(document, /[{}]/, 'sem chaves de modelo no corpo');
});

void test('docx: notas reais em Bookman 9, tabelas com cabecalho azul e total, memoria de calculo depois de quebra, figura com legenda', async () => {
  const { built, zip, document, footnotes } = await unpack();
  assert.equal(built.footnoteCount, 2);
  assert.equal((document.match(/<w:footnoteReference w:id="/g) ?? []).length, 2);
  assert.match(footnotes, /Disponível em: &lt;https:\/\/www\.planalto\.gov\.br[^<]*&gt;\. Acesso em: 30 set\. 2026\./);
  assert.match(footnotes, /<w:sz w:val="18"\/>/);
  assert.match(document, /w:fill="1F3864"/);
  assert.match(document, /<w:color w:val="FFFFFF"\/>/);
  assert.match(document, /w:fill="D9E2F3"/);
  assert.match(document, /<w:pageBreakBefore\/>[\s\S]*MEMÓRIA DE CÁLCULO DO VALOR DA CAUSA/);
  assert.match(document, /Verificação do teto \(40 salários mínimos\)/);
  assert.match(document, /VALOR DA CAUSA/);
  assert.ok(Object.keys(zip.files).some((name) => name.startsWith('word/media/') && name.endsWith('.png')), 'print embutido');
  assert.match(document, /<w:i\/>[\s\S]*Figura 1\. Extrato HISCON/);
});

void test('docx: o mesmo conteudo gera o mesmo document.xml; figura ausente nao gera peca', async () => {
  const fig = await figure();
  // `wp:docPr id` e numerado pela biblioteca por processo; o resto do document.xml e igual.
  const xml = async () =>
    new PizZip((await buildPetitionDocx(samplePetition(), new Map([['print-1', fig]]))).file)
      .file('word/document.xml')
      ?.asText()
      .replace(/<wp:docPr id="\d+"/g, '<wp:docPr id="n"');
  assert.equal(await xml(), await xml());
  await assert.rejects(buildPetitionDocx(samplePetition()), /figure_missing:print-1/);
});
