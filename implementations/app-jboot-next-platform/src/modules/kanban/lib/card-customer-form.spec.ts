import { describe, expect, it } from "vitest";
import type { CardCustomerDto } from "./kanban-api";
import {
  buildLinkPayload,
  buildUpdatePayload,
  customerFormFromDto,
  emptyCustomerForm,
  validateCustomerForm,
  buildOverrideLinkPayload,
  describeOverrideError,
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
  validateOverrideReason,
} from "./card-customer-form";

const CUSTOMER: CardCustomerDto = {
  id: "cust-1",
  name: "Maria",
  documentNumber: "52998224725",
  email: "maria@example.test",
  phone: null,
  status: "active",
  addressZip: null,
  addressStreet: null,
  addressNumber: null,
  addressComplement: null,
  addressNeighborhood: null,
  addressCity: null,
  addressState: "SP",
  juridico: {
    dataNascimento: "1980-01-02",
    nacionalidade: "brasileira",
    estadoCivil: null,
    profissao: null,
    rgNumero: null,
    rgOrgaoEmissor: null,
    rgUf: null,
    nomeMae: null,
    numeroBeneficio: null,
    especieBeneficio: null,
    bancoPagamento: null,
    hipossuficienciaDeclarada: false,
    observacoes: null,
  },
};

describe("card customer form", () => {
  it("builds the link payload with only filled fields", () => {
    const form = { ...emptyCustomerForm(), name: " Maria ", phone: "11 9999", profissao: "aposentada" };
    expect(buildLinkPayload("52998224725", form)).toEqual({
      cpf: "52998224725",
      customer: { name: "Maria", phone: "11 9999" },
      juridico: { profissao: "aposentada" },
    });
    expect(buildLinkPayload("52998224725", { ...emptyCustomerForm(), name: "Ana" })).toEqual({
      cpf: "52998224725",
      customer: { name: "Ana" },
    });
  });

  it("builds a patch with only changes: empty core is skipped, empty juridico clears", () => {
    const original = customerFormFromDto(CUSTOMER);
    const edited = { ...original, email: "", phone: "1188", nacionalidade: "", profissao: "pedreiro", hipossuficienciaDeclarada: true };
    expect(buildUpdatePayload(edited, original)).toEqual({
      hasChanges: true,
      payload: {
        customer: { phone: "1188" },
        juridico: { nacionalidade: null, profissao: "pedreiro", hipossuficienciaDeclarada: true },
      },
    });
    expect(buildUpdatePayload(original, original)).toEqual({ hasChanges: false, payload: {} });
  });

  it("validates required name and formats", () => {
    expect(validateCustomerForm(emptyCustomerForm())).toBe("Informe o nome do cliente");
    expect(validateCustomerForm({ ...emptyCustomerForm(), name: "A", email: "x" })).toBe("E-mail invalido");
    expect(validateCustomerForm({ ...emptyCustomerForm(), name: "A", rgUf: "sp" })).toBe("UF do RG invalida");
    expect(validateCustomerForm(customerFormFromDto(CUSTOMER))).toBeNull();
  });
});

describe("override do admin do tenant (Sprint 3)", () => {
  it("valida o motivo depois do trim, entre 10 e 500 caracteres", () => {
    expect(validateOverrideReason("")).toBe("Informe o motivo do vinculo");
    expect(validateOverrideReason("          ")).toBe("Informe o motivo do vinculo");
    expect(validateOverrideReason("  curto  ")).toMatch(/ao menos 10/);
    expect(validateOverrideReason("x".repeat(501))).toMatch(/no maximo 500/);
    expect(validateOverrideReason("  Transferido da base  ")).toBeNull();
    expect(validateOverrideReason("x".repeat(OVERRIDE_REASON_MAX_LENGTH))).toBeNull();
    expect(OVERRIDE_REASON_MIN_LENGTH).toBe(10);
  });

  it("monta o payload so com CPF e motivo aparado, sem dados do cliente", () => {
    expect(buildOverrideLinkPayload("52998224725", "  Transferido da base de Campinas  ")).toEqual({
      cpf: "52998224725",
      override: { reason: "Transferido da base de Campinas" },
    });
  });

  it("traduz os erros estruturados do override e ignora os demais", () => {
    expect(describeOverrideError("override_not_allowed")).toMatch(/Somente o administrador do Flow/);
    expect(describeOverrideError("override_requires_existing_customer")).toMatch(/Nao ha cliente cadastrado/);
    expect(describeOverrideError("customer_outside_boards")).toBeNull();
    expect(describeOverrideError(null)).toBeNull();
  });
});
