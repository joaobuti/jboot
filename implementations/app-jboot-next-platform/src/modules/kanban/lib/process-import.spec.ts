import { describe, expect, it, vi } from "vitest";
import { kanbanApi } from "./kanban-api";
import { buildRows, cellCpf, detectColumns, ERROR_MESSAGES, ROW_ERROR_LABEL, WARNING_LABEL } from "./process-import";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: () => "flow-token" }));

// Dados ficticios: nomes inventados, CPF sintetico e numero CNJ calculado. Nunca dados de planilha real.
const HEADERS = ["NOME", "ESTADO", "CPF", "ADVOGADO", "AUTOS", "STATUS"];

describe("planilha de processos", () => {
  it("reconhece as colunas pelo cabecalho, sem acento e sem diferenca de caixa", () => {
    expect(detectColumns(HEADERS)).toEqual({ name: 0, cpf: 2, processNumber: 4, state: 1, situation: 5 });
    expect(detectColumns(["Nome do Cliente", "Número do Processo", "Situação", "cpf"])).toEqual({
      name: 0, cpf: 3, processNumber: 1, state: null, situation: 2,
    });
  });

  it("CPF salvo como numero no Excel recupera os zeros a esquerda; mascara fica como veio", () => {
    expect(cellCpf("12910051")).toBe("00012910051");
    expect(cellCpf("529.982.247-25")).toBe("529.982.247-25");
  });

  it("monta as linhas com o numero da linha da planilha e ignora linhas vazias", () => {
    const sheet = {
      headers: HEADERS,
      rows: [
        { line: 2, cells: ["Pessoa Ficticia", "TRF1", "529.982.247-25", "X", "0000001-74.2026.4.01.4200", "REPLICA 30/06"] },
        { line: 3, cells: ["", "", "", "", "", ""] },
      ],
    };
    expect(buildRows(sheet, detectColumns(HEADERS))).toEqual([
      { line: 2, name: "Pessoa Ficticia", cpf: "529.982.247-25", processNumber: "0000001-74.2026.4.01.4200", state: "TRF1", situation: "REPLICA 30/06" },
    ]);
  });
});

describe("cliente HTTP da importacao", () => {
  it("confere, cria, consulta e retoma pelo domain-integrations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    const body = { boardId: "b", officeId: "o", rows: [{ line: 2, name: "n", cpf: "c", processNumber: "p" }] };
    await kanbanApi.processImports.preview(body);
    await kanbanApi.processImports.create(body);
    await kanbanApi.processImports.status("lot");
    await kanbanApi.processImports.resume("lot");
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toMatch(/\/domain-integrations\/flow\/process-imports\/preview$/);
    expect(urls[1]).toMatch(/\/domain-integrations\/flow\/process-imports$/);
    expect(urls[2]).toMatch(/\/domain-integrations\/flow\/process-imports\/lot$/);
    expect(urls[3]).toMatch(/\/domain-integrations\/flow\/process-imports\/lot\/resume$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(body);
  });
});

describe("mensagens da importacao sem o Juridico (ADR 021)", () => {
  it("aviso, erro de linha e recusa por capacidade nao contratada", () => {
    expect(WARNING_LABEL.monitored_in_juridico).toMatch(/Jurídico/);
    expect(ROW_ERROR_LABEL.process_monitor_in_use).toMatch(/Jurídico/);
    expect(ERROR_MESSAGES.process_monitoring_not_contracted).toMatch(/Monitoramento processual/);
    expect(ERROR_MESSAGES.juridico_required).toBeUndefined();
  });
});
