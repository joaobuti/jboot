import React from "react";
import { CHECKLIST_PENDING_BADGE } from "@/modules/kanban/lib/card-documents";

/** Badge "Checklist pendente" do tile e do modal; renderiza so quando o backend sinaliza. */
export default function ChecklistPendingBadge({ pending }: { pending: boolean | undefined }) {
  if (!pending) {
    return null;
  }
  return (
    <span className={`badge ${CHECKLIST_PENDING_BADGE.badge}`} title={CHECKLIST_PENDING_BADGE.title}>
      <i className={`${CHECKLIST_PENDING_BADGE.icon} me-1`} />
      {CHECKLIST_PENDING_BADGE.label}
    </span>
  );
}
