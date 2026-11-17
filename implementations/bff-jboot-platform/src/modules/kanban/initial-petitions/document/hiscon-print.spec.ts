import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { DocumentRasterizerService } from '../../customer-validation/document-rasterizer.service';
import { HisconPrintService, printRegionProblems, toPixels } from './hiscon-print';

/**
 * PDF minimo de uma pagina 400x200 pt com um retangulo preto no canto inferior esquerdo do espaco do
 * PDF; `rotate` = /Rotate da pagina (pagina deitada no HISCON). Escrito aqui so para testar orientacao.
 */
function minimalPdf(rotate: number): Buffer {
  const content = '0 0 0 rg 0 0 100 50 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Rotate ${rotate} /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Caixa (em fracoes) dos pixels escuros da imagem. */
async function darkBox(image: Buffer | { width: number; height: number; getContext: unknown }) {
  const source = Buffer.isBuffer(image) ? await loadImage(image) : (image as unknown as Parameters<ReturnType<typeof createCanvas>['getContext']>[0] & { width: number; height: number });
  const canvas = createCanvas((source as { width: number }).width, (source as { height: number }).height);
  const context = canvas.getContext('2d');
  context.drawImage(source as never, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4] < 60) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  return { x: minX / width, y: minY / height, x2: (maxX + 1) / width, y2: (maxY + 1) / height, portrait: height > width };
}

void test('regiao: vazia, fora da pagina ou destaque fora do recorte e recusada; fracoes viram pixels', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.8, height: 0.3 };
  assert.deepEqual(printRegionProblems({ crop, highlight: { x: 0.2, y: 0.3, width: 0.5, height: 0.05 } }), []);
  assert.deepEqual(printRegionProblems({ crop, highlight: { x: 0.2, y: 0.6, width: 0.5, height: 0.05 } }), ['o destaque precisa ficar dentro do recorte']);
  assert.deepEqual(printRegionProblems({ crop: { ...crop, width: 0.95 }, highlight: { x: 0.2, y: 0.3, width: 0.5, height: 0.05 } }), ['recorte vazio ou fora da pagina']);
  assert.deepEqual(toPixels({ x: 0.5, y: 0.5, width: 0.6, height: 0.1 }, 1000, 2000), { x: 500, y: 1000, width: 500, height: 200 });
});

void test('pagina deitada: a regiao vista pela rotina cai no mesmo lugar do arquivo em alta resolucao', async () => {
  const rasterizer = new DocumentRasterizerService();
  for (const rotate of [0, 90]) {
    const pdf = minimalPdf(rotate);
    const seen = await rasterizer.render(pdf, 'application/pdf', 1);
    const { canvas: high } = await rasterizer.renderCanvas(pdf, 'application/pdf', 1, 3200);
    const a = await darkBox(seen.jpeg);
    const b = await darkBox(await high.encode('png'));
    assert.equal(a.portrait, rotate === 90, `orientacao com /Rotate ${rotate}`);
    assert.equal(b.portrait, a.portrait);
    for (const key of ['x', 'y', 'x2', 'y2'] as const) {
      assert.ok(Math.abs(a[key] - b[key]) < 0.01, `/Rotate ${rotate} ${key}: ${a[key]} x ${b[key]}`);
    }
    // Pagina de 400 pt: escala maxima 6 (2400 px). Num A4 o lado maior chega a 3200 px.
    assert.ok(Math.max(high.width, high.height) >= 2400, 'boa resolucao');
  }
});

void test('print: recorte do arquivo original com sombreado amarelo e moldura vermelha 220,0,0 de 6 px', async () => {
  const source = createCanvas(1000, 500);
  const ctx = source.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1000, 500);
  const png = await source.encode('png');
  const print = await new HisconPrintService(new DocumentRasterizerService()).render(png, 'image/png', {
    figureId: 'print-1',
    page: 1,
    crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.4 },
    highlight: { x: 0.2, y: 0.3, width: 0.5, height: 0.1 }
  });
  assert.deepEqual([print.width, print.height], [800, 200]);
  const image = await loadImage(print.png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixel = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
  // Destaque em pixels do recorte: x 100..600, y 50..100.
  assert.deepEqual(pixel(102, 75), [220, 0, 0], 'moldura');
  const inside = pixel(350, 75);
  assert.ok(inside[0] > 240 && inside[1] > 220 && inside[2] < 200, `sombreado amarelo: ${inside}`);
  assert.deepEqual(pixel(20, 20), [255, 255, 255], 'contexto sem destaque');
  await assert.rejects(
    new HisconPrintService(new DocumentRasterizerService()).render(png, 'image/png', {
      figureId: 'p', page: 1, crop: { x: 0, y: 0, width: 0.5, height: 0.5 }, highlight: { x: 0.6, y: 0.6, width: 0.1, height: 0.1 }
    }),
    /print_region_invalid/
  );
});
