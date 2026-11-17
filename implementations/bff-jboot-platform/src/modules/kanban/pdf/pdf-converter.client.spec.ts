import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { convertDocxToPdf, isPdf, PDF_CONVERTER_FILE_NAME, PdfConversionError } from './pdf-converter.client';

const OPTIONS = { url: 'http://gotenberg:3000/', user: 'jboot-pdf', password: 'segredo-de-teste', timeoutMs: 60_000 };
const PDF = Buffer.from('%PDF-1.7\nconteudo sintetico');

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: () => Promise<Response> | Response, captured: Captured[] = []) {
  return async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return response();
  };
}

const errorCode = (expected: string, retryable: boolean) => (error: unknown) =>
  error instanceof PdfConversionError && error.code === expected && error.retryable === retryable;

void test('requisicao: rota LibreOffice, basic auth, multipart com nome GENERICO, timeout e sem redirect', async () => {
  const captured: Captured[] = [];
  const pdf = await convertDocxToPdf(Buffer.from('PK docx sintetico'), OPTIONS, fakeFetch(() => new Response(PDF, { status: 200 }), captured));
  assert.deepEqual(pdf, PDF);
  assert.equal(captured[0].url, 'http://gotenberg:3000/forms/libreoffice/convert');
  assert.equal(captured[0].init.method, 'POST');
  assert.equal(captured[0].init.redirect, 'error');
  assert.ok(captured[0].init.signal);
  const headers = captured[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Basic ${Buffer.from('jboot-pdf:segredo-de-teste').toString('base64')}`);
  const form = captured[0].init.body as FormData;
  const files = form.getAll('files');
  assert.equal(files.length, 1);
  assert.equal((files[0] as File).name, PDF_CONVERTER_FILE_NAME);
  assert.equal(PDF_CONVERTER_FILE_NAME, 'document.docx');
});

void test('erros: sem URL, auth, recusa, indisponivel, timeout e saida que nao e PDF', async () => {
  const docx = Buffer.from('PK');
  await assert.rejects(convertDocxToPdf(docx, { ...OPTIONS, url: '' }, fakeFetch(() => new Response(PDF))), errorCode('converter_not_configured', false));
  await assert.rejects(convertDocxToPdf(docx, OPTIONS, fakeFetch(() => new Response('', { status: 401 }))), errorCode('converter_auth_failed', false));
  await assert.rejects(convertDocxToPdf(docx, OPTIONS, fakeFetch(() => new Response('', { status: 400 }))), errorCode('converter_rejected', false));
  await assert.rejects(convertDocxToPdf(docx, OPTIONS, fakeFetch(() => new Response('', { status: 503 }))), errorCode('converter_unavailable', true));
  await assert.rejects(convertDocxToPdf(docx, OPTIONS, fakeFetch(() => new Response('', { status: 504 }))), errorCode('converter_timeout', true));
  await assert.rejects(
    convertDocxToPdf(docx, OPTIONS, fakeFetch(() => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })))),
    errorCode('converter_timeout', true)
  );
  await assert.rejects(
    convertDocxToPdf(docx, OPTIONS, fakeFetch(() => Promise.reject(new TypeError('fetch failed')))),
    errorCode('converter_unavailable', true)
  );
  await assert.rejects(
    convertDocxToPdf(docx, OPTIONS, fakeFetch(() => new Response('<html>erro</html>', { status: 200 }))),
    errorCode('converter_invalid_output', true)
  );
});

void test('assinatura %PDF-', () => {
  assert.equal(isPdf(PDF), true);
  assert.equal(isPdf(Buffer.from('%PDF-')), false);
  assert.equal(isPdf(Buffer.from('PK\u0003\u0004')), false);
});
