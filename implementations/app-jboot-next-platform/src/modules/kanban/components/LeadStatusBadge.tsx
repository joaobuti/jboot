import React from "react";
import { LeadStatus } from "@/modules/kanban/lib/kanban-api";
import { LEAD_STATUS_META } from "@/modules/kanban/lib/leads";

/**
 * Estado do lead (CRM de leads, Sprint 4) no tile, no card e na fila. `null`
 * (sem envio) nao renderiza; com `showDraft` o rascunho aparece (painel do card).
 */
export default function LeadStatusBadge({ status, showDraft = false }: { status: LeadStatus | null | undefined; showDraft?: boolean }) {
  if (!status || (status === "rascunho" && !showDraft)) {
    return null;
  }
  const meta = LEAD_STATUS_META[status];
  return (
    <span className={`badge ${meta.badge}`} title="Estado do lead">
      <i className={`${meta.icon} me-1`} />
      {meta.label}
    </span>
  );
}
