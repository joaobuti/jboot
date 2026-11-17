import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChecklistPendingBadge from "@/modules/kanban/components/ChecklistPendingBadge";
import { CHECKLIST_PENDING_BADGE } from "./card-documents";

describe("ChecklistPendingBadge (Sprint 3)", () => {
  it("renderiza o badge so quando o backend sinaliza checklistPending", () => {
    const html = renderToStaticMarkup(createElement(ChecklistPendingBadge, { pending: true }));
    expect(html).toContain("Checklist pendente");
    expect(html).toContain(CHECKLIST_PENDING_BADGE.badge);
    expect(html).toContain(CHECKLIST_PENDING_BADGE.icon);
    expect(renderToStaticMarkup(createElement(ChecklistPendingBadge, { pending: false }))).toBe("");
    expect(renderToStaticMarkup(createElement(ChecklistPendingBadge, { pending: undefined }))).toBe("");
  });

  it("reusa o padrao visual soft do indicador de completude", () => {
    expect(CHECKLIST_PENDING_BADGE.badge).toMatch(/^bg-[a-z]+-subtle text-[a-z]+$/);
  });
});
