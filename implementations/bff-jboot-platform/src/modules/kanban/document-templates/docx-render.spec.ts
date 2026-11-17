import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import PizZip from 'pizzip';
import { buildDocx, DOCM_MAIN, REL_BASE } from '../../../test/docx-fixture';
import { inspectEditedDocx, renderDocxTemplate } from './docx-render';
import { TemplateValidationRunner } from './template-validation-runner.service';
import { buildTemplateData, SYNTHETIC_TEMPLATE_SOURCE } from './template-variable-catalog';

function documentXml(buffer: Buffer): string {
  return new PizZip(buffer).file('word/document.xml')?.asText() ?? '';
}

void test('render: valores do catalogo entram como texto escapado; ausente vira [PREENCHER: campo]', () => {
  const template = buildDocx({
    paragraphs: ['Nome: {{cliente.nome}}', 'CPF: {{cliente.cpf}}', 'Mae: {{cliente.nome_mae}}', '{{#lead.casos}}{{ordem}}. {{tipo}};{{/lead.casos}}']
  });
  const data = buildTemplateData({
    ...SYNTHETIC_TEMPLATE_SOURCE,
    customer: { ...SYNTHETIC_TEMPLATE_SOURCE.customer, name: 'Ana <b>& Cia</b>' },
    juridico: SYNTHETIC_TEMPLATE_SOURCE.juridico ? { ...SYNTHETIC_TEMPLATE_SOURCE.juridico, nomeMae: null } : null
  });
  const result = renderDocxTemplate(template, data);
  assert.ok(result.ok);
  if (!result.ok) return;
  const xml = documentXml(Buffer.from(result.file));
  assert.match(xml, /Nome: Ana &lt;b&gt;&amp; Cia&lt;\/b&gt;/);
  assert.match(xml, /CPF: 123\.456\.789-09/);
  assert.match(xml, /Mae: \[PREENCHER: cliente\.nome_mae\]/);
  assert.match(result.text, /1\. Tipo de caso exemplo A;2\. Tipo de caso exemplo B;/);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(xml, /\{\{/);
});

void test('render: pacote relido com a mesma seguranca do upload (macro/zip invalido recusados)', () => {
  const macro = buildDocx({ mainContentType: DOCM_MAIN, paragraphs: ['{{cliente.nome}}'] });
  const rejected = renderDocxTemplate(macro, {});
  assert.equal(rejected.ok, false);
  assert.equal(!rejected.ok && rejected.code, 'template_macro_forbidden');
  const broken = renderDocxTemplate(Buffer.from('PK\u0003\u0004 nao e zip'), {});
  assert.equal(broken.ok, false);
});

void test('versao editada: sem exigir variavel; marcador restante vira aviso; vinculo externo/macro recusados', () => {
  const clean = inspectEditedDocx(buildDocx({ paragraphs: ['Documento revisado pelo gestor'] }));
  assert.ok(clean.ok);
  assert.deepEqual(clean.ok && clean.warnings, []);

  const leftovers = inspectEditedDocx(buildDocx({ paragraphs: ['Ola {{cliente.nome}}', 'Mae: [PREENCHER: cliente.nome_mae]'] }));
  assert.ok(leftovers.ok);
  assert.deepEqual(
    leftovers.ok && leftovers.warnings.map((warning) => warning.code),
    ['template_tag_left', 'fill_marker_left']
  );

  const external = inspectEditedDocx(
    buildDocx({
      paragraphs: ['x'],
      documentRelationships: [{ id: 'rId9', type: `${REL_BASE}/image`, target: 'http://example.invalid/pixel.png', external: true }]
    })
  );
  assert.equal(!external.ok && external.code, 'template_external_link_forbidden');
  const macro = inspectEditedDocx(buildDocx({ mainContentType: DOCM_MAIN }));
  assert.equal(!macro.ok && macro.code, 'template_macro_forbidden');
});

void test('runner: render e inspecao em worker thread devolvem o mesmo resultado da funcao pura', async () => {
  const runner = new TemplateValidationRunner();
  const template = buildDocx({ paragraphs: ['Escritorio: {{escritorio.nome}}'] });
  const rendered = await runner.render(template, buildTemplateData(SYNTHETIC_TEMPLATE_SOURCE));
  assert.ok(rendered.ok);
  assert.match(rendered.ok ? rendered.text : '', /Escritorio: Escritorio Exemplo/);
  const inspected = await runner.inspectEdited(buildDocx({ paragraphs: ['ok'] }));
  assert.ok(inspected.ok);
});
