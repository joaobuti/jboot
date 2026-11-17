import { describe, expect, it } from "vitest";
import { signatureStatus } from "./CardSignedKitSection";
import { kitEmailStatus } from "./CardDocumentsPanel";
import { columnActionConfigs, columnAgentDrafts } from "./BoardActionsSettings";
import type { BoardActionsDto, CardActionDto, CardSignatureDto } from "@/modules/kanban/lib/kanban-api";

const signed = { id: "s2", version: 2, fileName: "kit.pdf", contentType: "application/pdf", sizeBytes: 10, createdAt: "t" };
const view = (overrides: Partial<CardSignatureDto> = {}): CardSignatureDto => ({
  kitId: "kit", signed, validation: null, approved: false, canUpload: true, canConfirm: false, ...overrides,
});
const run = (overrides: Partial<NonNullable<CardSignatureDto["validation"]>> = {}) => ({
  id: "r1", status: "answered" as const, errorCode: null, verdict: "aprovado" as const, summary: "ok", findings: [], answeredAt: "t", confirmedAt: null, current: true, ...overrides,
});

describe("kit assinado no card (S2)", () => {
  it("descreve cada situacao do kit assinado", () => {
    expect(signatureStatus(view({ signed: null }))).toBeNull();
    expect(signatureStatus(view())?.text).toBe("Aguardando validação");
    expect(signatureStatus(view({ validation: run({ status: "dispatched", verdict: null }) }))?.text).toBe("Validando assinatura");
    expect(signatureStatus(view({ validation: run() }))?.text).toBe("IA aprovou: aguardando confirmação");
    expect(signatureStatus(view({ validation: run({ verdict: "pendencias" }) }))?.text).toBe("IA apontou pendências");
    expect(signatureStatus(view({ validation: run({ status: "expired", verdict: null, errorCode: "routine_not_reached" }) }))?.text).toBe(
      "Validação não concluída: a rotina não chegou ao Flow em 5 minutos",
    );
    // Parecer de versao anterior do assinado nao vale.
    expect(signatureStatus(view({ validation: run({ current: false }) }))?.text).toBe("Aguardando validação");
    expect(signatureStatus(view({ approved: true, validation: run({ confirmedAt: "t" }) }))?.text).toBe("Assinatura aprovada");
  });

  it("acao Validar assinatura: select so com agente salvo pela propria conta (S5)", () => {
    const context = {
      assignments: [
        { columnId: "c1", actionId: "validar-assinatura", agentId: "a1", configuredByCurrentUser: true },
        { columnId: "c2", actionId: "validar-assinatura", agentId: "a2", configuredByCurrentUser: false },
        { columnId: "c1", actionId: "monitorar", agentId: null, configuredByCurrentUser: true },
      ],
    } as unknown as BoardActionsDto;
    expect(columnAgentDrafts(context, "c1")).toEqual({ "validar-assinatura": "a1" });
    expect(columnAgentDrafts(context, "c2")).toEqual({});
    expect(columnAgentDrafts(null, "c1")).toEqual({});
  });

  it("acao Validar assinatura: so salva com agente e envia config so da acao marcada (S5)", () => {
    const actions = [
      { id: "monitorar", label: "Monitorar" },
      { id: "validar-assinatura", label: "Validar assinatura", config: "routine_agent" },
    ] as CardActionDto[];
    expect(columnActionConfigs(actions, ["validar-assinatura"], {}).missing?.id).toBe("validar-assinatura");
    expect(columnActionConfigs(actions, ["validar-assinatura", "monitorar"], { "validar-assinatura": "a1" })).toEqual({
      configs: [{ actionId: "validar-assinatura", agentId: "a1" }], missing: null,
    });
    expect(columnActionConfigs(actions, ["monitorar"], { "validar-assinatura": "a1" })).toEqual({ configs: [], missing: null });
  });

  it("descreve o envio do kit por e-mail (S4)", () => {
    expect(kitEmailStatus({ status: "pending", to: "maria@exemplo.com", sentAt: null })).toBe("Envio por e-mail para maria@exemplo.com na fila.");
    expect(kitEmailStatus({ status: "failed", to: "maria@exemplo.com", sentAt: null })).toBe(
      "Não foi possível enviar por e-mail para maria@exemplo.com. Baixe o kit e envie manualmente.",
    );
    expect(kitEmailStatus({ status: "sent", to: "maria@exemplo.com", sentAt: "2026-11-02T15:00:00Z" })).toBe(
      "Enviado por e-mail para maria@exemplo.com em 02/11/2026.",
    );
  });
});
