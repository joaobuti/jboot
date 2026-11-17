import { describe, expect, it } from "vitest";
import { CardDto, KanbanApiError, OfficeContextDto } from "./kanban-api";
import { describeKanbanError } from "./card-documents";
import { describeOverrideError } from "./card-customer-form";
import {
  describeOfficeError,
  filterCardsByOffice,
  isUserWithoutOffice,
  newCardOfficeChoice,
  OFFICE_FILTER_ALL,
  OFFICE_FILTER_NONE,
  officeNameMap,
  USER_WITHOUT_OFFICE_MESSAGE,
  validateTransferReason,
} from "./offices";

const A = { id: "a", name: "Escritorio A", active: true };
const B = { id: "b", name: "Escritorio B", active: true };
const OLD = { id: "old", name: "Antigo", active: false };

function context(overrides: Partial<OfficeContextDto> = {}): OfficeContextDto {
  return { officeVisibilityEnabled: true, isAdmin: false, userOfficeIds: ["a"], offices: [A], ...overrides };
}

describe("newCardOfficeChoice", () => {
  it("chave desligada ou sem contexto: sem escritorio na criacao", () => {
    expect(newCardOfficeChoice(null)).toEqual({ mode: "none" });
    expect(newCardOfficeChoice(context({ officeVisibilityEnabled: false }))).toEqual({ mode: "none" });
  });

  it("um escritorio ativo: automatico; varios: escolha entre os ativos proprios", () => {
    expect(newCardOfficeChoice(context())).toEqual({ mode: "auto", office: A });
    expect(newCardOfficeChoice(context({ userOfficeIds: ["a", "b", "old"], offices: [A, B, OLD] }))).toEqual({
      mode: "choose",
      options: [A, B],
    });
  });

  it("admin escolhe entre todos os ativos; sem escritorio ativo bloqueia", () => {
    expect(newCardOfficeChoice(context({ isAdmin: true, userOfficeIds: [], offices: [A, B, OLD] }))).toEqual({
      mode: "choose",
      options: [A, B],
    });
    expect(newCardOfficeChoice(context({ userOfficeIds: ["old"], offices: [OLD] }))).toEqual({ mode: "blocked" });
    expect(newCardOfficeChoice(context({ userOfficeIds: [], offices: [] }))).toEqual({ mode: "blocked" });
  });
});

describe("isUserWithoutOffice", () => {
  it("so operador com a chave ligada e sem escritorio ativo", () => {
    expect(isUserWithoutOffice(context({ userOfficeIds: [], offices: [] }))).toBe(true);
    expect(isUserWithoutOffice(context({ userOfficeIds: ["old"], offices: [OLD] }))).toBe(true);
    expect(isUserWithoutOffice(context())).toBe(false);
    expect(isUserWithoutOffice(context({ isAdmin: true, userOfficeIds: [] }))).toBe(false);
    expect(isUserWithoutOffice(context({ officeVisibilityEnabled: false, userOfficeIds: [] }))).toBe(false);
    expect(isUserWithoutOffice(null)).toBe(false);
  });
});

describe("filterCardsByOffice e officeNameMap", () => {
  const cards = [{ id: "1", officeId: "a" }, { id: "2", officeId: "b" }, { id: "3", officeId: null }] as CardDto[];

  it("todos, sem escritorio e escritorio especifico", () => {
    expect(filterCardsByOffice(cards, OFFICE_FILTER_ALL).map((card) => card.id)).toEqual(["1", "2", "3"]);
    expect(filterCardsByOffice(cards, OFFICE_FILTER_NONE).map((card) => card.id)).toEqual(["3"]);
    expect(filterCardsByOffice(cards, "b").map((card) => card.id)).toEqual(["2"]);
  });

  it("mapa de nomes", () => {
    expect(officeNameMap([A, B]).get("b")).toBe("Escritorio B");
  });
});

describe("validateTransferReason", () => {
  it("espelha os limites do backend depois do trim", () => {
    expect(validateTransferReason("   ")).toBe("Informe o motivo da transferencia");
    expect(validateTransferReason("curto")).toMatch(/ao menos 10/);
    expect(validateTransferReason("x".repeat(501))).toMatch(/no maximo 500/);
    expect(validateTransferReason("  carteira redistribuida  ")).toBeNull();
  });
});

describe("mensagens de erro de escritorio", () => {
  it("codigos estruturados viram mensagem pt-BR (tambem pelo describeKanbanError)", () => {
    expect(describeOfficeError("user_without_office")).toBe(USER_WITHOUT_OFFICE_MESSAGE);
    expect(describeOfficeError("office_required")).toMatch(/Escolha o escritorio/);
    expect(describeOfficeError("office_not_allowed")).toMatch(/inativo/);
    expect(describeOfficeError("no_active_office")).toMatch(/ao menos um escritorio ativo/);
    expect(describeOfficeError("office_name_taken")).toMatch(/mesmo nome|com este nome/);
    expect(describeOfficeError("identity_not_in_card_office")).toMatch(/nao pertence/);
    expect(describeOfficeError("outro")).toBeNull();
    const error = new KanbanApiError(422, JSON.stringify({ code: "office_required", message: "Choose the office of the card" }));
    expect(describeKanbanError(error, "x")).toBe("Escolha o escritorio do card.");
  });

  it("vinculo de cliente entre escritorios", () => {
    expect(describeOverrideError("cross_office_link_requires_admin")).toMatch(/outro escritorio/);
    expect(describeOverrideError("cross_office_override_required")).toMatch(/motivo/);
  });
});
