import { describe, expect, it, vi, beforeEach } from "vitest";
import { actionsForCard, actionsForColumn, isMonitoredSourceType } from "./card-actions";
import { BoardActionsDto, kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: () => "flow-token" }));

const context: BoardActionsDto = {
  canConfigure: true, canExecute: true,
  categories: [{ id: "juridico", label: "Jurídico" }],
  columns: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
  actions: [
    { id: "gerar-protocolo", category: "juridico", label: "Gerar Protocolo", description: "Descrição", icon: "ri-file-add-line", boardSelectable: true, interaction: "execute", perCardAvailability: false },
    { id: "monitorar", category: "juridico", label: "Monitorar", description: "Descrição", icon: "ri-radar-line", boardSelectable: true, interaction: "dialog", perCardAvailability: true },
    { id: "internal", category: "juridico", label: "Interna", description: "Interna", icon: "", boardSelectable: false, interaction: "execute", perCardAvailability: false },
  ],
  assignments: [
    { columnId: "a", actionId: "monitorar", agentId: null, configuredByCurrentUser: true },
    { columnId: "a", actionId: "gerar-protocolo", agentId: null, configuredByCurrentUser: true },
    { columnId: "b", actionId: "internal", agentId: null, configuredByCurrentUser: true },
  ],
  availableCardIds: { monitorar: ["ready"] },
};

describe("Ações por coluna", () => {
  it("mostra múltiplas ações da coluna atual; ao mover para outra coluna deixa de oferecê-las", () => {
    expect(actionsForColumn(context, "a").map(action => action.id)).toEqual(["gerar-protocolo", "monitorar"]);
    expect(actionsForColumn(context, "b")).toEqual([]);
    expect(actionsForColumn(context, "unknown")).toEqual([]);
    expect(actionsForColumn(null, "a")).toEqual([]);
  });

  it("remoção de associação afeta todos os cards sem mutar o catálogo", () => {
    const cleared = { ...context, assignments: [] };
    expect(actionsForColumn(cleared, "a")).toEqual([]);
    expect(context.actions).toHaveLength(3);
  });
});

describe("Ações por card (Monitorar)", () => {
  it("Monitorar so aparece no card com peticao para enviar; as demais acoes da coluna seguem em todos", () => {
    const column = actionsForColumn(context, "a");
    expect(actionsForCard(context, column, "ready").map(action => action.id)).toEqual(["gerar-protocolo", "monitorar"]);
    expect(actionsForCard(context, column, "other").map(action => action.id)).toEqual(["gerar-protocolo"]);
    expect(actionsForCard(null, column, "ready").map(action => action.id)).toEqual(["gerar-protocolo"]);
  });

  it("cards com acompanhamento DataJud: export de consulta e card de peticao", () => {
    expect(isMonitoredSourceType("datajud_processo")).toBe(true);
    expect(isMonitoredSourceType("flow_petition")).toBe(true);
    expect(isMonitoredSourceType("flow_process_import")).toBe(true);
    expect(isMonitoredSourceType("pje_comunicacao")).toBe(false);
    expect(isMonitoredSourceType(null)).toBe(false);
  });
});

describe("Cliente HTTP das ações", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("carrega catálogo e permissões do board usando a sessão Flow", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(context), { status: 200 }));
    expect(await kanbanApi.actions.list("board")).toEqual(context);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/kanban\/boards\/board\/actions$/);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer flow-token");
  });

  it("salva múltiplas ações e permite remover todas sem enviar tenant", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 204 }));
    await kanbanApi.actions.replace("board", "a", ["monitorar", "gerar-protocolo"]);
    await kanbanApi.actions.replace("board", "a", []);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/boards\/board\/columns\/a\/actions$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ actionIds: ["monitorar", "gerar-protocolo"] });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ actionIds: [] });
  });

  it("executa via POST e preserva a mensagem retornada pelo backend", async () => {
    const result = { actionId: "monitorar", cardId: "card", message: "backend acao Monitorar" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    expect(await kanbanApi.actions.execute("board", "card", "monitorar")).toEqual(result);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/cards\/card\/actions\/monitorar\/execute$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("propaga negativa de permissão e associação removida", async () => {
    for (const status of [403, 409]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "denied", message: "Ação indisponível" }), { status }));
      await expect(kanbanApi.actions.execute("board", "card", "monitorar")).rejects.toMatchObject({ status, detail: "Ação indisponível" });
    }
  });
});
