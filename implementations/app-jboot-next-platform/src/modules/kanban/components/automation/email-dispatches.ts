import type { AutomationTriggerType, EmailDispatchListDto, EmailDispatchStatus } from "@/modules/kanban/lib/kanban-api";

type DispatchItem = EmailDispatchListDto["items"][number];

export const DISPATCH_STATUS: Record<EmailDispatchStatus, { label: string; color: string }> = {
  pending: { label: "Aguardando", color: "warning" },
  processing: { label: "Enviando", color: "info" },
  sent: { label: "Enviado", color: "success" },
  skipped: { label: "Ignorado", color: "secondary" },
  failed: { label: "Falhou", color: "danger" },
};

export const TRIGGER_LABEL: Record<AutomationTriggerType, string> = {
  column_entered: "Entrada na coluna",
  column_left: "Saída da coluna",
  due_date_approaching: "Prazo próximo",
  card_stale: "Card parado",
  juridico_process_moved: "Movimentação processual (DataJud)",
  djen_publication_received: "Publicação no DJEN",
  ai_completed: "Conclusão da IA",
  signed_kit_approved: "Kit assinado aprovado",
};

/** Pendente com tentativa anterior e retentativa; sem tentativa e o primeiro envio. */
export function attemptLabel(item: Pick<DispatchItem, "status" | "attemptCount">, maxAttempts: number): string {
  if (item.status === "failed") return `${item.attemptCount} de ${maxAttempts} (esgotadas)`;
  if (item.attemptCount === 0) return "Primeiro envio";
  return `${item.attemptCount} de ${maxAttempts}`;
}

export function canRetry(item: Pick<DispatchItem, "status">): boolean {
  return item.status === "failed";
}

/** Minutos desde o pendente mais antigo, ou null sem backlog. */
export function oldestPendingMinutes(oldestPendingAt: string | null, now = Date.now()): number | null {
  if (!oldestPendingAt) return null;
  const at = Date.parse(oldestPendingAt);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((now - at) / 60000));
}

export function errorLabel(lastError: string | null): string {
  if (!lastError) return "—";
  const labels: Record<string, string> = {
    stuck_before_outbox: "Parado antes da fila durável (reprocessar para enviar)",
    rule_inactive: "Regra desativada ou removida",
    card_missing: "Card removido",
    source_missing: "Evento de origem não encontrado",
  };
  return labels[lastError] ?? lastError;
}
