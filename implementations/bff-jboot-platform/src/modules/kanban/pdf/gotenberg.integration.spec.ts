import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { buildDocx } from '../../../test/docx-fixture';
import { extractPdfText, normalizeText } from '../../../test/pdf-text';
import { renderDocxTemplate } from '../document-templates/docx-render';
import { buildTemplateData, SYNTHETIC_TEMPLATE_SOURCE } from '../document-templates/template-variable-catalog';
import { convertDocxToPdf, isPdf, PdfConversionError } from './pdf-converter.client';

/**
 * Integracao REAL com o conversor (container `gotenberg`, rede interna
 * `jboot-pdf-internal`; ADR 014, Decisao 2). Roda dentro do container `jboot`
 * (`npm test`); sem o conversor de pe, PULA com a instrucao de como subir.
 * Fixture `.docx` SINTETICA renderizada pelo mesmo caminho da geracao (S6).
 */

const options = {
  url: process.env.JBOOT_PDF_CONVERTER_URL ?? '',
  user: process.env.JBOOT_PDF_CONVERTER_USER ?? '',
  password: process.env.JBOOT_PDF_CONVERTER_PASSWORD ?? '',
  timeoutMs: 60_000
};

async function converterUp(): Promise<string | null> {
  if (!options.url) {
    return 'JBOOT_PDF_CONVERTER_URL ausente (rode dentro do container jboot)';
  }
  try {
    const response = await fetch(`${options.url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok ? null : `health ${response.status}`;
  } catch {
    return `conversor inacessivel em ${options.url}`;
  }
}

const SKIP_HINT = 'suba com `make code-up TARGET=kanban-leads` (ou `docker compose up -d gotenberg`)';

void test('Gotenberg real: .docx gerado do modelo sintetico vira PDF com o mesmo texto', async (t) => {
  const down = await converterUp();
  if (down) {
    t.skip(`Gotenberg indisponivel: ${down}; ${SKIP_HINT}`);
    return;
  }
  const template = buildDocx({
    paragraphs: [
      'PROCURACAO SINTETICA',
      'Outorgante: {{cliente.nome}}, CPF {{cliente.cpf}}, nascida em {{cliente.data_nascimento_extenso}}.',
      'Endereco: {{cliente.endereco_completo}}.',
      'Escritorio: {{escritorio.nome}}. Caso: {{caso.tipo}}.',
      'Acentuação e cedilha: ação, coração, é, ã, ô.'
    ]
  });
  const rendered = renderDocxTemplate(template, buildTemplateData(SYNTHETIC_TEMPLATE_SOURCE));
  assert.ok(rendered.ok);
  if (!rendered.ok) return;
  const docx = Buffer.from(rendered.file);

  const pdf = await convertDocxToPdf(docx, options);
  assert.ok(isPdf(pdf));
  const text = normalizeText(extractPdfText(pdf));
  for (const expected of [
    'PROCURACAO SINTETICA',
    'Outorgante: Maria Exemplo da Silva, CPF 123.456.789-09, nascida em 5 de março de 1960.',
    'Endereco: Rua Exemplo, 100, Apto 12, Centro, Sao Paulo/SP, CEP 01001-000.',
    'Escritorio: Escritorio Exemplo. Caso: Tipo de caso exemplo A.',
    'Acentuação e cedilha: ação, coração, é, ã, ô.'
  ]) {
    assert.ok(text.includes(expected), `texto ausente no PDF: "${expected}"\nPDF: ${text}`);
  }
  assert.doesNotMatch(text, /\{\{|PREENCHER/);
  // Mesmo .docx convertido de novo: conteudo textual igual (deterministico para o teste de fidelidade).
  const again = normalizeText(extractPdfText(await convertDocxToPdf(docx, options)));
  assert.equal(again, text);
  assert.match(createHash('sha256').update(pdf).digest('hex'), /^[0-9a-f]{64}$/);
});

void test('Gotenberg real: sem credencial = 401 (basic auth ligado)', async (t) => {
  const down = await converterUp();
  if (down) {
    t.skip(`Gotenberg indisponivel: ${down}; ${SKIP_HINT}`);
    return;
  }
  await assert.rejects(
    convertDocxToPdf(buildDocx(), { ...options, user: '', password: '' }),
    (error) => error instanceof PdfConversionError && error.code === 'converter_auth_failed'
  );
});
