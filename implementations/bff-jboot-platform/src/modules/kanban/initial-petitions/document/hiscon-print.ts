import { Injectable } from '@nestjs/common';
import { createCanvas } from '@napi-rs/canvas';
import { z } from 'zod/v4';
import { DocumentRasterizerService } from '../../customer-validation/document-rasterizer.service';
import { PetitionFigure } from './petition-docx';

/**
 * Print do HISCON na acao de RMC com refinanciamento (ADR 020, decisao do usuario 12; secao 12 do
 * prompt do escritorio). A rotina indica a pagina e duas regioes em fracoes (0 a 1) da imagem da
 * pagina que ela recebeu: o recorte (linha com um pouco de contexto, cabecalho quando couber) e o
 * destaque (a linha ou as competencias). O Flow redesenha a pagina do arquivo original em boa
 * resolucao, na mesma orientacao da imagem da rotina (pagina deitada inclusa), recorta, aplica
 * sombreado amarelo translucido e moldura vermelha RGB 220,0,0 de 6 px sobre o destaque.
 */
export const PRINT_RENDER_SIDE = 3200;
export const FRAME_COLOR = 'rgb(220, 0, 0)';
export const FRAME_WIDTH = 6;
export const HIGHLIGHT_FILL = 'rgba(255, 230, 0, 0.35)';
const MIN_FRACTION = 0.01;

const fraction = z.number().min(0).max(1);
export const regionSchema = z.object({ x: fraction, y: fraction, width: fraction, height: fraction });

export const hisconPrintSchema = z.object({
  figureId: z.string().regex(/^[a-z0-9_-]{1,60}$/).describe('Id usado no bloco figure da peticao'),
  page: z.number().int().min(1).max(100),
  crop: regionSchema.describe('Recorte com contexto, em fracoes da imagem da pagina recebida'),
  highlight: regionSchema.describe('Linha ou competencias destacadas, dentro do recorte')
});

export type PrintRegion = z.infer<typeof regionSchema>;
export type HisconPrintRequest = z.infer<typeof hisconPrintSchema>;

/** Problemas da regiao (vazia, fora da pagina, destaque fora do recorte). */
export function printRegionProblems(request: Pick<HisconPrintRequest, 'crop' | 'highlight'>): string[] {
  const problems: string[] = [];
  const inside = (region: PrintRegion) => region.x + region.width <= 1.000001 && region.y + region.height <= 1.000001;
  const sized = (region: PrintRegion) => region.width >= MIN_FRACTION && region.height >= MIN_FRACTION;
  if (!sized(request.crop) || !inside(request.crop)) problems.push('recorte vazio ou fora da pagina');
  if (!sized(request.highlight) || !inside(request.highlight)) problems.push('destaque vazio ou fora da pagina');
  const { crop, highlight } = request;
  if (
    highlight.x < crop.x ||
    highlight.y < crop.y ||
    highlight.x + highlight.width > crop.x + crop.width + 0.000001 ||
    highlight.y + highlight.height > crop.y + crop.height + 0.000001
  ) {
    problems.push('o destaque precisa ficar dentro do recorte');
  }
  return problems;
}

/** Fracoes -> pixels inteiros dentro da imagem. */
export function toPixels(region: PrintRegion, width: number, height: number) {
  const x = Math.max(0, Math.floor(region.x * width));
  const y = Math.max(0, Math.floor(region.y * height));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.ceil(region.width * width))),
    height: Math.max(1, Math.min(height - y, Math.ceil(region.height * height)))
  };
}

@Injectable()
export class HisconPrintService {
  constructor(private readonly rasterizer: DocumentRasterizerService) {}

  async render(body: Buffer, contentType: string, request: HisconPrintRequest): Promise<PetitionFigure> {
    const problems = printRegionProblems(request);
    if (problems.length > 0) throw new Error(`print_region_invalid:${problems.join('; ')}`);
    const { canvas: page } = await this.rasterizer.renderCanvas(body, contentType, request.page, PRINT_RENDER_SIDE);
    const crop = toPixels(request.crop, page.width, page.height);
    const mark = toPixels(request.highlight, page.width, page.height);
    const output = createCanvas(crop.width, crop.height);
    const context = output.getContext('2d');
    context.drawImage(page, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const box = { x: mark.x - crop.x, y: mark.y - crop.y, width: mark.width, height: mark.height };
    context.fillStyle = HIGHLIGHT_FILL;
    context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = FRAME_COLOR;
    context.lineWidth = FRAME_WIDTH;
    // Moldura por dentro do destaque: nao some na borda do recorte.
    const half = FRAME_WIDTH / 2;
    context.strokeRect(box.x + half, box.y + half, Math.max(1, box.width - FRAME_WIDTH), Math.max(1, box.height - FRAME_WIDTH));
    return { png: await output.encode('png'), width: crop.width, height: crop.height };
  }
}
