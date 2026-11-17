import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDocx, DOCM_MAIN, paragraphXml, REL_BASE } from '../../../test/docx-fixture';
import { TEMPLATE_LIMITS, TemplateLimits } from './docx-package';
import {
  catalogParser,
  TemplateValidationFailure,
  TemplateValidationOutcome,
  TemplateValidationSuccess,
  validateDocxTemplate
} from './docx-template-validator';
import { TEMPLATE_CATALOG_VERSION } from './template-variable-catalog';

function ok(outcome: TemplateValidationOutcome): TemplateValidationSuccess {
  assert.equal(outcome.ok, true, `esperava sucesso: ${JSON.stringify(outcome)}`);
  return outcome as TemplateValidationSuccess;
}

function rejected(outcome: TemplateValidationOutcome, code: string, status = 422): TemplateValidationFailure {
  assert.equal(outcome.ok, false, `esperava recusa ${code}`);
  const failure = outcome as TemplateValidationFailure;
  assert.equal(failure.code, code, JSON.stringify(failure));
  assert.equal(failure.status, status);
  return failure;
}

/** Altera um campo de 32 bits do registro do diretorio central da entrada `name`. */
function patchCentralField(buffer: Buffer, name: string, fieldOffset: number, value: number): Buffer {
  const copy = Buffer.from(buffer);
  for (let offset = 0; offset < copy.length - 46; offset += 1) {
    if (copy.readUInt32LE(offset) !== 0x02014b50) {
      continue;
    }
    const nameLength = copy.readUInt16LE(offset + 28);
    if (copy.subarray(offset + 46, offset + 46 + nameLength).toString('utf8') === name) {
      copy.writeUInt32LE(value, offset + fieldOffset);
      return copy;
    }
  }
  throw new Error(`entrada ${name} nao encontrada`);
}

const CENTRAL_UNCOMPRESSED_SIZE = 24;
const CENTRAL_COMPRESSED_SIZE = 20;

void test('modelo valido: variaveis do catalogo, laco de casos e condicional; render de prova com dados sinteticos formatados', () => {
  const buffer = buildDocx({
    paragraphs: [
      'Eu, {{cliente.nome}}, CPF {{ cliente.cpf }}, nascida em {{cliente.data_nascimento_extenso}},',
      'residente em {{cliente.endereco_completo}}, atendida por {{escritorio.nome}}.',
      '{{#lead.casos}}{{ordem}}. {{tipo}} - {{cliente.nome}}{{/lead.casos}}',
      '{{#cliente.hipossuficiente}}Declara hipossuficiencia.{{/cliente.hipossuficiente}}{{^cliente.hipossuficiente}}Nao declara.{{/cliente.hipossuficiente}}',
      'Caso: {{caso.tipo}}. Enviado em {{lead.data_envio}}. {{data.hoje_extenso}}.'
    ]
  });
  const outcome = ok(validateDocxTemplate(buffer));
  assert.equal(outcome.status, 'valid');
  assert.equal(outcome.catalogVersion, TEMPLATE_CATALOG_VERSION);
  assert.deepEqual(outcome.unknownVariables, []);
  assert.match(outcome.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    outcome.variables.map((variable) => [variable.key, variable.known, variable.valueType]),
    [
      ['caso.tipo', true, 'text'],
      ['cliente.cpf', true, 'text'],
      ['cliente.data_nascimento_extenso', true, 'text'],
      ['cliente.endereco_completo', true, 'text'],
      ['cliente.hipossuficiente', true, 'boolean'],
      ['cliente.nome', true, 'text'],
      ['data.hoje_extenso', true, 'text'],
      ['escritorio.nome', true, 'text'],
      ['lead.casos', true, 'collection'],
      ['lead.casos[].ordem', true, 'text'],
      ['lead.casos[].tipo', true, 'text'],
      ['lead.data_envio', true, 'text']
    ]
  );
  assert.deepEqual(outcome.variables.find((variable) => variable.key === 'cliente.hipossuficiente')?.usages, [
    'section',
    'inverted_section'
  ]);
  // Render de prova: valores sinteticos ja formatados pelo catalogo, laco expandido, condicional resolvida.
  assert.ok(outcome.proofRenderBytes > 0);
  const text = outcome.proofRenderText;
  assert.match(text, /Maria Exemplo da Silva, CPF 123\.456\.789-09, nascida em 5 de março de 1960/);
  assert.match(text, /Rua Exemplo, 100, Apto 12, Centro, Sao Paulo\/SP, CEP 01001-000/);
  assert.match(text, /1\. Tipo de caso exemplo A - Maria Exemplo da Silva2\. Tipo de caso exemplo B/);
  assert.match(text, /Declara hipossuficiencia\./);
  assert.doesNotMatch(text, /Nao declara/);
  assert.match(text, /Enviado em 12\/10\/2026\. 12 de outubro de 2026\./);
  assert.doesNotMatch(text, /\{\{|PREENCHER/);
});

void test('variavel desconhecida: versao salva como invalid_variables e o render de prova marca o campo', () => {
  const outcome = ok(
    validateDocxTemplate(
      buildDocx({ paragraphs: ['{{cliente.nomee}} {{cliente.nome}}', '{{#lead.casos}}{{numero}}{{/lead.casos}}', '{{#outra_lista}}{{x}}{{/outra_lista}}'] })
    )
  );
  assert.equal(outcome.status, 'invalid_variables');
  assert.deepEqual(outcome.unknownVariables, ['cliente.nomee', 'lead.casos[].numero', 'outra_lista', 'x']);
  assert.equal(outcome.variables.find((variable) => variable.key === 'cliente.nome')?.known, true);
  assert.match(outcome.proofRenderText, /\[PREENCHER: cliente\.nomee\]/);
});

void test('raw XML {{@...}} e recusado (tag sozinha no paragrafo e no meio do texto)', () => {
  const alone = rejected(validateDocxTemplate(buildDocx({ paragraphs: ['{{@cliente.nome}}'] })), 'template_raw_xml_forbidden');
  assert.deepEqual(alone.details.tags, ['cliente.nome']);
  rejected(validateDocxTemplate(buildDocx({ paragraphs: ['texto {{@xml}} texto'] })), 'template_raw_xml_forbidden');
});

void test('tag fora da gramatica (filtro, expressao, maiuscula) e recusada sem executar nada', () => {
  const failure = rejected(
    validateDocxTemplate(buildDocx({ paragraphs: ['{{cliente.nome | upper}} {{Cliente.Nome}} {{cliente.nome + 1}}'] })),
    'template_tag_invalid'
  );
  assert.deepEqual(failure.details.tags, ['cliente.nome | upper', 'Cliente.Nome', 'cliente.nome + 1']);
});

void test('uso incompativel com o tipo do catalogo e recusado', () => {
  const textAsLoop = rejected(
    validateDocxTemplate(buildDocx({ paragraphs: ['{{#cliente.nome}}x{{/cliente.nome}}'] })),
    'template_variable_kind_mismatch'
  );
  assert.deepEqual(textAsLoop.details.tags, [{ tag: 'cliente.nome', expected: 'text', usage: 'section' }]);
  rejected(validateDocxTemplate(buildDocx({ paragraphs: ['{{cliente.hipossuficiente}}'] })), 'template_variable_kind_mismatch');
  rejected(validateDocxTemplate(buildDocx({ paragraphs: ['{{lead.casos}}'] })), 'template_variable_kind_mismatch');
});

void test('erros de sintaxe do core voltam como lista (tag nao fechada, laco sem fim)', () => {
  const failure = rejected(
    validateDocxTemplate(buildDocx({ paragraphs: ['{{cliente.nome', '{{#lead.casos}} sem fim'] })),
    'template_invalid'
  );
  const errors = failure.details.errors as Array<{ id: string; part: string }>;
  assert.deepEqual(errors.map((error) => error.id).sort(), ['unclosed_loop', 'unclosed_tag']);
  assert.ok(errors.every((error) => error.part === 'word/document.xml'));
});

void test('aviso de digitacao para tag quase certa (chave simples ou fechamento incompleto)', () => {
  const outcome = ok(validateDocxTemplate(buildDocx({ paragraphs: ['Nome {cliente.nome} e {{cliente.cpf}}'] })));
  assert.deepEqual(outcome.warnings, [{ code: 'possible_malformed_tag', detail: '{cliente.nome}' }]);
  assert.equal(outcome.status, 'valid');
});

void test('.docm, vbaProject e conteudo de macro sao recusados', () => {
  rejected(validateDocxTemplate(buildDocx({ mainContentType: DOCM_MAIN })), 'template_macro_forbidden');
  rejected(validateDocxTemplate(buildDocx({ extraFiles: { 'word/vbaProject.bin': Buffer.from('macro') } })), 'template_macro_forbidden');
  rejected(
    validateDocxTemplate(
      buildDocx({ documentRelationships: [{ id: 'rId9', type: 'http://schemas.microsoft.com/office/2006/relationships/vbaProject', target: 'vba.bin' }] })
    ),
    'template_macro_forbidden'
  );
  rejected(
    validateDocxTemplate(buildDocx({ mainContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' })),
    'template_not_word_document'
  );
});

void test('objeto OLE/ActiveX embutido e recusado', () => {
  rejected(
    validateDocxTemplate(buildDocx({ extraFiles: { 'word/embeddings/oleObject1.bin': Buffer.from('ole') } })),
    'template_embedded_object_forbidden'
  );
  rejected(
    validateDocxTemplate(buildDocx({ extraFiles: { 'word/activeX/activeX1.xml': '<ax/>' } })),
    'template_embedded_object_forbidden'
  );
  rejected(
    validateDocxTemplate(buildDocx({ documentRelationships: [{ id: 'rId5', type: `${REL_BASE}/oleObject`, target: 'embeddings/x.bin' }] })),
    'template_embedded_object_forbidden'
  );
});

void test('imagem vinculada externamente e campo DDE/INCLUDEPICTURE sao recusados; hyperlink passa; modelo anexo externo gera aviso', () => {
  const image = rejected(
    validateDocxTemplate(
      buildDocx({ documentRelationships: [{ id: 'rId7', type: `${REL_BASE}/image`, target: 'http://rastreio.example/pixel.png', external: true }] })
    ),
    'template_external_link_forbidden'
  );
  assert.deepEqual(image.details, { relationship: 'image' });
  rejected(
    validateDocxTemplate(
      buildDocx({ bodyXml: '<w:p><w:r><w:instrText xml:space="preserve"> DDEAUTO c:\\\\windows\\\\cmd.exe "/c calc" </w:instrText></w:r></w:p>' })
    ),
    'template_external_link_forbidden'
  );
  rejected(
    validateDocxTemplate(buildDocx({ bodyXml: '<w:p><w:fldSimple w:instr=" INCLUDEPICTURE &quot;http://x.example/a.png&quot; \\d "/></w:p>' })),
    'template_external_link_forbidden'
  );
  const withLinks = ok(
    validateDocxTemplate(
      buildDocx({
        paragraphs: ['{{cliente.nome}}'],
        documentRelationships: [
          { id: 'rId2', type: `${REL_BASE}/hyperlink`, target: 'https://www.example.com', external: true },
          { id: 'rId3', type: `${REL_BASE}/attachedTemplate`, target: 'file:///C:/Modelos/Normal.dotm', external: true }
        ]
      })
    )
  );
  assert.deepEqual(withLinks.warnings.map((warning) => warning.code), ['attached_template_external']);
  // Codigo de campo dividido em runs e com entidade XML (como o Word grava) continua detectado.
  const split = rejected(
    validateDocxTemplate(
      buildDocx({ bodyXml: '<w:p><w:r><w:instrText> DD</w:instrText></w:r><w:r><w:instrText>EAUTO c:\\\\x</w:instrText></w:r></w:p>' })
    ),
    'template_external_link_forbidden'
  );
  assert.deepEqual(split.details, { field: 'DDEAUTO' });
  const entity = rejected(
    validateDocxTemplate(buildDocx({ bodyXml: '<w:p><w:r><w:instrText>&#73;NCLUDETEXT "x"</w:instrText></w:r></w:p>' })),
    'template_external_link_forbidden'
  );
  assert.deepEqual(entity.details, { field: 'INCLUDETEXT' });
  // HYPERLINK como campo nao e confundido com LINK.
  ok(validateDocxTemplate(buildDocx({ bodyXml: '<w:p><w:r><w:instrText> HYPERLINK "https://www.example.com" </w:instrText></w:r></w:p>' })));
});

void test('zip bomb: entradas demais, tamanho descompactado e razao recusados ANTES de descompactar', () => {
  const small: TemplateLimits = { ...TEMPLATE_LIMITS, maxEntries: 10 };
  const many: Record<string, string> = {};
  for (let index = 0; index < 11; index += 1) {
    many[`word/media/f${index}.txt`] = 'x';
  }
  const entries = rejected(validateDocxTemplate(buildDocx({ extraFiles: many }), small), 'template_archive_limits_exceeded');
  assert.equal(entries.details.limit, 'entries');

  // 51 MB de zeros compactam para ~50 KB: recusado pela razao (100:1) sem inflar nada.
  const zeros = buildDocx({ extraFiles: { 'word/media/zeros.bin': Buffer.alloc(51 * 1024 * 1024) } });
  assert.ok(zeros.length < TEMPLATE_LIMITS.maxCompressedBytes);
  const ratio = rejected(validateDocxTemplate(zeros), 'template_archive_limits_exceeded');
  assert.equal(ratio.details.limit, 'compression_ratio');
  // Com a razao liberada, a soma descompactada declarada (> 50 MB) ainda recusa.
  const size = rejected(
    validateDocxTemplate(zeros, { ...TEMPLATE_LIMITS, maxCompressionRatio: Number.MAX_SAFE_INTEGER }),
    'template_archive_limits_exceeded'
  );
  assert.equal(size.details.limit, 'uncompressed_size');

  rejected(validateDocxTemplate(buildDocx(), { ...TEMPLATE_LIMITS, maxCompressedBytes: 100 }), 'template_too_large', 413);
});

void test('zip bomb: tamanho declarado menor que o real aborta a descompactacao; entradas sobrepostas e lixo recusados', () => {
  const docx = buildDocx({ paragraphs: ['{{cliente.nome}} '.repeat(50)] });
  const lying = patchCentralField(docx, 'word/document.xml', CENTRAL_UNCOMPRESSED_SIZE, 10);
  const failure = rejected(validateDocxTemplate(lying), 'template_archive_invalid');
  assert.equal(failure.details.reason, 'entry_size_mismatch');

  const overlapping = patchCentralField(docx, 'word/document.xml', CENTRAL_COMPRESSED_SIZE, docx.length);
  assert.equal(rejected(validateDocxTemplate(overlapping), 'template_archive_invalid').details.reason, 'overlapping_entries');

  assert.equal(
    rejected(validateDocxTemplate(Buffer.from('PK\u0003\u0004 nao e zip de verdade, so o comeco', 'latin1')), 'template_archive_invalid').details.reason,
    'end_of_central_directory_missing'
  );
});

void test('documento sem tags e valido; texto do core sem dado de cliente; STORE tambem e aceito', () => {
  const outcome = ok(validateDocxTemplate(buildDocx({ paragraphs: ['Sem variaveis'], compression: 'STORE' })));
  assert.equal(outcome.status, 'valid');
  assert.deepEqual(outcome.variables, []);
  ok(validateDocxTemplate(buildDocx({ bodyXml: paragraphXml('{{data.hoje}}') })));
});

void test('parser restrito: so propriedade propria e caminho da gramatica; nada de prototipo', () => {
  const scope = { cliente: { nome: 'A' } };
  assert.equal(catalogParser('cliente.nome').get(scope), 'A');
  assert.equal(catalogParser(' cliente.nome ').get(scope), 'A');
  assert.equal(catalogParser('constructor').get(scope), undefined);
  assert.equal(catalogParser('cliente.toString').get(scope), undefined);
  assert.equal(catalogParser('cliente["nome"]').get(scope), undefined);
});
