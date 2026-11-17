// sanitize-html exporta `module.exports = fn` e o projeto compila sem esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sanitizeHtml = require('sanitize-html');
import { createHmac } from 'node:crypto';
import { MovementDto } from '../shared/juridico-data/juridico-data.types';

/**
 * Regras puras das publicacoes do DJEN e do calendario do acompanhamento (ADR 022, Sprint 7 de
 * docs/product/process-monitoring-sprints.md).
 */

/** Brasil sem horario de verao desde 2019: Brasilia = UTC-3. */
const BRASILIA_OFFSET_MS = 3 * 3_600_000;

/** Data de hoje em Brasilia (AAAA-MM-DD). */
export function todayInBrasilia(now = Date.now()): string {
  return new Date(now - BRASILIA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Data (AAAA-MM-DD, Brasilia) de um instante. */
export function dateInBrasilia(value: string | Date): string {
  return todayInBrasilia(new Date(value).getTime());
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Soma dias uteis (so fim de semana; feriados ficam fora, ADR 022). */
export function addBusinessDays(date: string, days: number): string {
  let current = date;
  let left = days;
  while (left > 0) {
    current = addDays(current, 1);
    if (!isWeekend(current)) left -= 1;
  }
  return current;
}

/** Primeira consulta do DJEN cobre os ultimos 7 dias e so estabelece a base. */
export const DJEN_BASELINE_DAYS = 7;

const BLOCK_END = /<\s*(br\s*\/?|\/p|\/div|\/tr|\/section|\/li|\/h[1-6]|\/table|\/article|\/header|\/footer)\b[^>]*>/gi;
const CELL_END = /<\s*\/t[dh]\s*>/gi;

/**
 * Texto puro a partir do HTML do DJEN: quebra de linha nos blocos, sem estilo/script, entidades
 * decodificadas. A tela nunca recebe o HTML do provedor.
 */
export function publicationText(html: string | null | undefined): string {
  if (!html) return '';
  const marked = html.replace(BLOCK_END, (tag) => `${tag}\n`).replace(CELL_END, (tag) => `${tag} `);
  const stripped = sanitizeHtml(marked, { allowedTags: [], allowedAttributes: {} });
  const decoded = stripped
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return decoded
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function publicationExcerpt(text: string, max = 600): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Mudanca de vara entre movimentacoes do DataJud (ADR 022): item proprio na lista, so quando a vara
 * muda. A identificacao e estavel pela troca e pela data, entao nao se repete a cada consulta.
 */
export function courtChanges(
  key: string,
  movements: Array<Pick<MovementDto, 'dataHora' | 'orgaoJulgador'> & { fingerprint: string }>
): Array<{ fingerprint: string; occurredAt: string | null; description: string; sourceFingerprint: string }> {
  const ordered = movements
    .filter((movement) => movement.orgaoJulgador?.nome?.trim())
    .slice()
    .sort((a, b) => String(a.dataHora ?? '').localeCompare(String(b.dataHora ?? '')));
  const changes: Array<{ fingerprint: string; occurredAt: string | null; description: string; sourceFingerprint: string }> = [];
  let previous: string | null = null;
  for (const movement of ordered) {
    const court = movement.orgaoJulgador!.nome!.trim();
    if (previous !== null && court !== previous) {
      changes.push({
        fingerprint: createHmac('sha256', key).update(JSON.stringify(['court_change', previous, court, movement.dataHora])).digest('hex'),
        occurredAt: movement.dataHora,
        description: `Mudança de vara: ${previous} → ${court}`,
        // So e novidade se a movimentacao que revelou a troca tambem for nova nesta consulta.
        sourceFingerprint: movement.fingerprint
      });
    }
    previous = court;
  }
  return changes;
}

/**
 * Movimentacao do DataJud que costuma gerar comunicacao no DJEN (Sprint 9): mostra "Ver no DJEN".
 * Peticao, juntada, conclusao e afins nao publicam nada.
 */
const COMMUNICATION_HINTS = ['publica', 'intima', 'expedi', 'decis', 'despacho', 'senten', 'acord', 'cita'];

export function movementMayHaveCommunication(description: string): boolean {
  // So o nome da movimentacao conta: o complemento ("Conclusao — para decisao") nao e o ato.
  const name = description.split(' — ')[0] ?? description;
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.startsWith('mudanca de vara')) return false;
  return COMMUNICATION_HINTS.some((hint) => normalized.includes(hint));
}

/** Periodo da busca sob demanda: 3 dias antes a 10 dias depois da movimentacao (Sprint 9). */
export function lookupWindow(occurredAt: string): { from: string; to: string } {
  const day = dateInBrasilia(occurredAt);
  return { from: addDays(day, -3), to: addDays(day, 10) };
}
