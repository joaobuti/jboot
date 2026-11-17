import { formatCnj, normalizeCnj } from "@/modules/juridico/lib/cnj";
import type { CardDto } from "./kanban-api";

/**
 * Linha do processo na face do card: o titulo e o cliente e o numero do processo vem abaixo, quando o
 * card tem um (importacao, Monitorar, exportacao do DataJud). Nao repete se o titulo ja traz o numero
 * (cards antigos ou do DataJud, que usam "DataJud <numero> - <classe>").
 */
export function cardProcessLine(card: Pick<CardDto, "title" | "sourcePayload">): string | null {
  const payload = card.sourcePayload ?? {};
  const raw = payload.processNumber ?? payload.numeroProcesso;
  if (typeof raw !== "string") return null;
  const digits = normalizeCnj(raw);
  if (digits.length !== 20) return null;
  const masked = formatCnj(digits);
  if (card.title.includes(masked) || card.title.replace(/\D/g, "").includes(digits)) return null;
  return `Processo ${masked}`;
}
