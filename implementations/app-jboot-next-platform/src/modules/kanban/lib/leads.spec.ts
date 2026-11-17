import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LeadStatusBadge from "@/modules/kanban/components/LeadStatusBadge";
import { describeKanbanError } from "./card-documents";
import { CardLeadDto, KanbanApiError, LeadStatus } from "./kanban-api";
import {
  describeLeadMissing,
  LEAD_FIELD_GROUPS,
  LEAD_FIELD_LABELS,
  LEAD_QUEUE_STATUSES,
  LEAD_STATUS_META,
  leadFieldLabel,
  leadIncompleteFromError,
  shouldShowLeadPanel,
  validateLeadReturnReason,
} from "./leads";

const BASE_LEAD: CardLeadDto = {
  cardId: "c1",
  status: "rascunho",
  leadIntakeEnabled: false,
  editable: true,
  canSubmit: false,
  canReturn: false,
  readiness: null,
  currentSubmission: null,
  customerSnapshot: null,
  history: [],
};

describe("leads (Sprint 4)", () => {
  it("todo estado do backend tem rotulo, badge soft e icone; fila nao oferece rascunho", () => {
    const statuses: LeadStatus[] = [
      "rascunho",
      "enviado",
      "em_processamento",
      "aguardando_revisao",
      "aprovado",
      "devolvido",
      "falha_processamento",
    ];
    for (const status of statuses) {
      expect(LEAD_STATUS_META[status].badge).toMatch(/^bg-[a-z]+-subtle text-[a-z]+$/);
      expect(LEAD_STATUS_META[status].icon.startsWith("ri-")).toBe(true);
    }
    expect(LEAD_QUEUE_STATUSES).not.toContain("rascunho");
  });

  it("catalogo de campos: todo campo agrupado tem rotulo; chave desconhecida aparece como veio", () => {
    const grouped = LEAD_FIELD_GROUPS.flatMap((group) => group.keys);
    expect(new Set(grouped)).toEqual(new Set(Object.keys(LEAD_FIELD_LABELS)));
    expect(leadFieldLabel("juridico.dataNascimento")).toBe("Data de nascimento");
    expect(leadFieldLabel("x")).toBe("x");
  });

  it("motivo da devolucao: 10..500 apos aparar (espelho do backend)", () => {
    expect(validateLeadReturnReason("   curto   ")).not.toBeNull();
    expect(validateLeadReturnReason("x".repeat(501))).not.toBeNull();
    expect(validateLeadReturnReason("  motivo valido  ")).toBeNull();
  });

  it("painel so em quadro com captacao ou lead que ja teve envio", () => {
    expect(shouldShowLeadPanel(null)).toBe(false);
    expect(shouldShowLeadPanel(BASE_LEAD)).toBe(false);
    expect(shouldShowLeadPanel({ ...BASE_LEAD, leadIntakeEnabled: true })).toBe(true);
    expect(shouldShowLeadPanel({ ...BASE_LEAD, status: "enviado", editable: false })).toBe(true);
  });

  it("422 lead_incomplete vira lista legivel do que falta", () => {
    const error = new KanbanApiError(
      422,
      JSON.stringify({
        code: "lead_incomplete",
        message: "x",
        customerLinked: false,
        missingFields: ["juridico.dataNascimento"],
        pendingDocumentTypes: [
          { id: "t1", name: "RG", state: "pendente" },
          { id: "t2", name: "Procuracao", state: "rejeitado" },
        ],
      })
    );
    const summary = leadIncompleteFromError(error);
    expect(summary).not.toBeNull();
    expect(describeLeadMissing(summary!)).toEqual([
      "Vincular o cliente ao card",
      "Preencher Data de nascimento",
      "Enviar RG",
      "Reenviar Procuracao",
    ]);
    expect(describeKanbanError(error, "fallback")).toContain("Falta: Vincular o cliente ao card;");
    expect(leadIncompleteFromError(new KanbanApiError(409, JSON.stringify({ code: "lead_frozen" })))).toBeNull();
  });

  it("erros estruturados do lead tem mensagem pt-BR", () => {
    for (const code of [
      "lead_frozen",
      "lead_intake_disabled",
      "lead_not_submittable",
      "lead_not_returnable",
      "lead_admin_required",
      "invalid_lead_fields",
    ]) {
      const message = describeKanbanError(new KanbanApiError(409, JSON.stringify({ code, message: "en" })), "fallback");
      expect(message).not.toBe("en");
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it("badge do estado: nada sem envio; rascunho so quando pedido", () => {
    expect(renderToStaticMarkup(createElement(LeadStatusBadge, { status: null }))).toBe("");
    expect(renderToStaticMarkup(createElement(LeadStatusBadge, { status: "rascunho" }))).toBe("");
    expect(renderToStaticMarkup(createElement(LeadStatusBadge, { status: "rascunho", showDraft: true }))).toContain("Rascunho");
    const html = renderToStaticMarkup(createElement(LeadStatusBadge, { status: "devolvido" }));
    expect(html).toContain("Devolvido ao escritório");
    expect(html).toContain(LEAD_STATUS_META.devolvido.badge);
  });
});
