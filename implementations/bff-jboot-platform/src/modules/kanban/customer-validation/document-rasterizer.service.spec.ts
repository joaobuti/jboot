import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { DocumentPageOutOfRangeError, DocumentRasterizerService, fitWithin } from './document-rasterizer.service';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const rasterizer = new DocumentRasterizerService();

void test('PDF real vira JPEG por pagina dentro de 1568 px e recusa pagina inexistente', async () => {
  const pdf = readFileSync(join(__dirname, 'fixtures', 'chromium-print.pdf'));
  const page = await rasterizer.render(pdf, 'application/pdf', 1);
  assert.deepEqual([...page.jpeg.subarray(0, 3)], JPEG_MAGIC);
  assert.equal(page.pageCount, 1);
  assert.equal(page.totalPages, 1);
  assert.ok(Math.max(page.width, page.height) <= 1568);
  await assert.rejects(() => rasterizer.render(pdf, 'application/pdf', 2), DocumentPageOutOfRangeError);
});

void test('inspectPdf: PDF real abre; com senha e corrompido sao recusados', async () => {
  assert.equal(await rasterizer.inspectPdf(readFileSync(join(__dirname, 'fixtures', 'chromium-print.pdf'))), null);
  assert.equal(await rasterizer.inspectPdf(readFileSync(join(__dirname, 'fixtures', 'password-protected.pdf'))), 'password_protected');
  assert.equal(await rasterizer.inspectPdf(Buffer.from('%PDF-1.7\nnao e um pdf')), 'unreadable');
});

void test('imagem grande e reduzida e sai como JPEG de uma pagina', async () => {
  const canvas = createCanvas(4000, 3000);
  canvas.getContext('2d').fillRect(0, 0, 10, 10);
  const png = await canvas.encode('png');
  const page = await rasterizer.render(png, 'image/png', 1);
  assert.deepEqual([page.width, page.height], [1568, 1176]);
  assert.deepEqual([...page.jpeg.subarray(0, 3)], JPEG_MAGIC);
  await assert.rejects(() => rasterizer.render(png, 'image/png', 2), DocumentPageOutOfRangeError);
});

void test('fitWithin nao amplia imagem pequena', () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});
