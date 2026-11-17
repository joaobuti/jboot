"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  FormGroup,
  Input,
  InputGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
} from "reactstrap";
import { CepAddress, CepInput } from "@/components/Common/CepInput";
import CardCustomerSummary from "@/modules/kanban/components/CardCustomerSummary";
import {
  buildLinkPayload,
  buildOverrideLinkPayload,
  buildUpdatePayload,
  customerFormFromDto,
  CustomerFormState,
  describeOverrideError,
  emptyCustomerForm,
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
  validateCustomerForm,
  validateOverrideReason,
} from "@/modules/kanban/lib/card-customer-form";
import { cpfDigits, formatCpf, isValidCpf } from "@/modules/kanban/lib/cpf";
import {
  CardCustomerDto,
  CardCustomerPanelDto,
  CUSTOMER_OUTSIDE_BOARDS_CODE,
  KanbanApiError,
  kanbanApi,
  OVERRIDE_REQUIRES_EXISTING_CUSTOMER_CODE,
} from "@/modules/kanban/lib/kanban-api";
import { UF_OPTIONS } from "@/modules/kanban/lib/ufs";

export type CardCustomerModalMode = "link" | "change" | "edit";

type Phase =
  | { kind: "search" }
  | { kind: "not_found"; cpf: string }
  /** `crossOffice` (Sprint 3.5): cliente de outro escritorio; `canOverride` so para `flow:admin`. */
  | { kind: "found"; cpf: string; customer: CardCustomerDto; crossOffice: boolean; canOverride: boolean }
  /** `canOverride` so vem do backend para `flow:admin`; `cpf` e o buscado (nulo quando veio de 409). */
  | { kind: "outside_boards"; cpf: string | null; canOverride: boolean }
  | { kind: "edit" };

type FieldName = Exclude<keyof CustomerFormState, "hipossuficienciaDeclarada">;

interface FieldDef {
  name: FieldName;
  label: string;
  section?: string;
  colMd?: number;
  type?: "text" | "email" | "date" | "uf" | "cep" | "textarea";
  required?: boolean;
  maxLength?: number;
}

interface StepDef {
  label: string;
  icon: string;
  fields: FieldDef[];
  /** Checkbox de hipossuficiencia fica no step juridico. */
  withHipossuficiencia?: boolean;
}


// Steps sem numero, icone por agrupamento (skills/platform-crud-ui.md).
const STEPS: StepDef[] = [
  {
    label: "Dados gerais",
    icon: "ri-file-text-line",
    fields: [
      { name: "name", label: "Nome", section: "Identificacao", required: true, colMd: 12, maxLength: 200 },
      { name: "phone", label: "Telefone", section: "Contato", maxLength: 40 },
      { name: "email", label: "E-mail", section: "Contato", type: "email", maxLength: 180 },
    ],
  },
  {
    label: "Endereco",
    icon: "ri-map-pin-line",
    fields: [
      { name: "addressZip", label: "CEP", type: "cep", colMd: 3 },
      { name: "addressStreet", label: "Logradouro", colMd: 7, maxLength: 60 },
      { name: "addressNumber", label: "Numero", colMd: 2, maxLength: 60 },
      { name: "addressComplement", label: "Complemento", colMd: 4, maxLength: 60 },
      { name: "addressNeighborhood", label: "Bairro", colMd: 4, maxLength: 60 },
      { name: "addressCity", label: "Cidade", colMd: 6, maxLength: 60 },
      { name: "addressState", label: "UF", type: "uf", colMd: 2 },
    ],
  },
  {
    label: "Juridico",
    icon: "ri-scales-3-line",
    withHipossuficiencia: true,
    fields: [
      { name: "dataNascimento", label: "Data de nascimento", section: "Qualificacao", type: "date", colMd: 4 },
      { name: "nacionalidade", label: "Nacionalidade", section: "Qualificacao", colMd: 4, maxLength: 60 },
      { name: "estadoCivil", label: "Estado civil", section: "Qualificacao", colMd: 4, maxLength: 40 },
      { name: "profissao", label: "Profissao", section: "Qualificacao", maxLength: 120 },
      { name: "nomeMae", label: "Nome da mae", section: "Qualificacao", maxLength: 200 },
      { name: "rgNumero", label: "RG", section: "Documento de identidade", colMd: 4, maxLength: 30 },
      { name: "rgOrgaoEmissor", label: "Orgao emissor", section: "Documento de identidade", colMd: 4, maxLength: 120 },
      { name: "rgUf", label: "UF do RG", section: "Documento de identidade", type: "uf", colMd: 4 },
      { name: "numeroBeneficio", label: "Numero do beneficio", section: "Beneficio", colMd: 4, maxLength: 30 },
      { name: "especieBeneficio", label: "Especie", section: "Beneficio", colMd: 4, maxLength: 120 },
      { name: "bancoPagamento", label: "Banco pagador", section: "Beneficio", colMd: 4, maxLength: 120 },
    ],
  },
  {
    label: "Observacoes",
    icon: "ri-sticky-note-line",
    fields: [{ name: "observacoes", label: "Observacoes", type: "textarea", colMd: 12, maxLength: 4000 }],
  },
];

const TITLES: Record<CardCustomerModalMode, string> = {
  link: "Vincular cliente",
  change: "Trocar cliente",
  edit: "Editar cliente",
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof KanbanApiError) {
    return error.detail ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function groupBySection(fields: FieldDef[]): Array<{ section?: string; fields: FieldDef[] }> {
  return fields.reduce<Array<{ section?: string; fields: FieldDef[] }>>((acc, field) => {
    const last = acc[acc.length - 1];
    if (last && last.section === field.section) {
      last.fields.push(field);
    } else {
      acc.push({ section: field.section, fields: [field] });
    }
    return acc;
  }, []);
}

interface CardCustomerModalProps {
  boardId: string;
  cardId: string;
  mode: CardCustomerModalMode | null;
  /** Cliente atual do card (obrigatorio em `edit`). */
  customer: CardCustomerDto | null;
  onClose: () => void;
  onSaved: (panel: CardCustomerPanelDto) => void;
}

/**
 * Vincular, trocar ou editar o cliente final do card. Busca por CPF com tres
 * respostas do backend: `not_found` (oferece cadastro), `found` (mostra os dados
 * e permite vincular) e `outside_boards` (so a mensagem, sem acao de vinculo).
 * Sprint 3: em `outside_boards` com `canOverride` (admin do tenant) a tela
 * oferece "Vincular como administrador" com motivo obrigatorio e auditado; a UI
 * nao decide quem e admin, so reage ao `canOverride` do backend.
 */
export default function CardCustomerModal({ boardId, cardId, mode, customer, onClose, onSaved }: CardCustomerModalProps) {
  const [cpfInput, setCpfInput] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "search" });
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm());
  const [activeStep, setActiveStep] = useState(0);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const originalForm = useMemo(() => (customer ? customerFormFromDto(customer) : emptyCustomerForm()), [customer]);

  useEffect(() => {
    if (!mode) {
      return;
    }
    setError(null);
    setActiveStep(0);
    setSearching(false);
    setSaving(false);
    setCpfInput("");
    setOverrideReason("");
    if (mode === "edit" && customer) {
      setForm(customerFormFromDto(customer));
      setPhase({ kind: "edit" });
    } else {
      setForm(emptyCustomerForm());
      setPhase({ kind: "search" });
    }
  }, [mode, customer]);

  if (!mode) {
    return null;
  }

  const showForm = phase.kind === "not_found" || phase.kind === "edit";
  const overrideAvailable = phase.kind === "outside_boards" && phase.canOverride && phase.cpf !== null;
  // Vinculo entre escritorios (P30): admin vincula com motivo; operador so ve o aviso.
  const crossOfficeOverride = phase.kind === "found" && phase.crossOffice && phase.canOverride;
  const crossOfficeBlocked = phase.kind === "found" && phase.crossOffice && !phase.canOverride;
  const overrideReasonError = validateOverrideReason(overrideReason);
  const busy = searching || saving;

  function handleCpfChange(value: string) {
    setCpfInput(formatCpf(value));
    if (phase.kind !== "search") {
      setPhase({ kind: "search" });
    }
    setOverrideReason("");
    setError(null);
  }

  async function handleSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!isValidCpf(cpfInput)) {
      setError("CPF invalido");
      return;
    }
    const cpf = cpfDigits(cpfInput);
    setSearching(true);
    setError(null);
    try {
      const result = await kanbanApi.cardCustomer.lookup(boardId, cardId, cpf);
      if (result.status === "found") {
        setOverrideReason("");
        setPhase({
          kind: "found",
          cpf,
          customer: result.customer,
          crossOffice: result.crossOffice === true,
          canOverride: result.canOverride === true,
        });
      } else if (result.status === "not_found") {
        setForm(emptyCustomerForm());
        setActiveStep(0);
        setPhase({ kind: "not_found", cpf });
      } else {
        setOverrideReason("");
        setPhase({ kind: "outside_boards", cpf, canOverride: result.canOverride === true });
      }
    } catch (err) {
      setError(errorMessage(err, "Erro ao buscar cliente"));
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit() {
    if (phase.kind === "found") {
      if (crossOfficeBlocked) {
        return;
      }
      if (crossOfficeOverride) {
        if (overrideReasonError) {
          setError(overrideReasonError);
          return;
        }
        const cpf = phase.cpf;
        await save(() => kanbanApi.cardCustomer.link(boardId, cardId, buildOverrideLinkPayload(cpf, overrideReason)));
        return;
      }
      await save(() => kanbanApi.cardCustomer.link(boardId, cardId, { cpf: phase.cpf }));
      return;
    }
    if (phase.kind === "outside_boards") {
      if (!phase.canOverride || phase.cpf === null) {
        return;
      }
      if (overrideReasonError) {
        setError(overrideReasonError);
        return;
      }
      const cpf = phase.cpf;
      await save(() => kanbanApi.cardCustomer.link(boardId, cardId, buildOverrideLinkPayload(cpf, overrideReason)));
      return;
    }
    const invalid = validateCustomerForm(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (phase.kind === "not_found") {
      await save(() => kanbanApi.cardCustomer.link(boardId, cardId, buildLinkPayload(phase.cpf, form)));
      return;
    }
    if (phase.kind === "edit") {
      const { payload, hasChanges } = buildUpdatePayload(form, originalForm);
      if (!hasChanges) {
        onClose();
        return;
      }
      await save(() => kanbanApi.cardCustomer.update(boardId, cardId, payload));
    }
  }

  async function save(operation: () => Promise<CardCustomerPanelDto>) {
    setSaving(true);
    setError(null);
    try {
      const panel = await operation();
      onSaved(panel);
      onClose();
    } catch (err) {
      if (err instanceof KanbanApiError && err.code === CUSTOMER_OUTSIDE_BOARDS_CODE) {
        // Corrida: cliente saiu da visibilidade entre a busca e o vinculo; nova busca reavalia o override.
        setPhase({ kind: "outside_boards", cpf: null, canOverride: false });
      } else if (err instanceof KanbanApiError && describeOverrideError(err.code)) {
        if (err.code === OVERRIDE_REQUIRES_EXISTING_CUSTOMER_CODE) {
          setPhase({ kind: "search" });
        }
        setError(describeOverrideError(err.code));
      } else {
        setError(errorMessage(err, "Erro ao salvar cliente"));
      }
    } finally {
      setSaving(false);
    }
  }

  function setField(name: FieldName, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleCepFound(address: CepAddress) {
    setForm((prev) => ({
      ...prev,
      ...(address.logradouro ? { addressStreet: address.logradouro } : {}),
      ...(address.bairro ? { addressNeighborhood: address.bairro } : {}),
      ...(address.localidade ? { addressCity: address.localidade } : {}),
      ...(address.uf ? { addressState: address.uf } : {}),
      ...(address.complemento ? { addressComplement: address.complemento } : {}),
    }));
  }

  function renderField(field: FieldDef) {
    const value = form[field.name];
    if (field.type === "cep") {
      return <CepInput value={value} onChange={(next) => setField(field.name, next)} onAddressFound={handleCepFound} disabled={saving} />;
    }
    if (field.type === "uf") {
      return (
        <Input type="select" value={value} onChange={(event) => setField(field.name, event.target.value)} disabled={saving}>
          <option value="">Selecione</option>
          {UF_OPTIONS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </Input>
      );
    }
    return (
      <Input
        type={field.type ?? "text"}
        rows={field.type === "textarea" ? 6 : undefined}
        value={value}
        maxLength={field.maxLength}
        required={field.required}
        onChange={(event) => setField(field.name, event.target.value)}
        disabled={saving}
      />
    );
  }

  const step = STEPS[activeStep];
  const cpfLabel = phase.kind === "not_found" ? formatCpf(phase.cpf) : customer?.documentNumber ? formatCpf(customer.documentNumber) : null;
  const primaryLabel =
    crossOfficeOverride || overrideAvailable ? "Vincular como administrador" : phase.kind === "found" ? "Vincular" : "Salvar";
  const canSubmit = (phase.kind === "found" && !crossOfficeBlocked) || showForm || overrideAvailable;

  return (
    <Modal isOpen toggle={busy ? undefined : onClose} centered scrollable size="xl" zIndex={1065}>
      <ModalHeader toggle={busy ? undefined : onClose}>{TITLES[mode]}</ModalHeader>
      <ModalBody>
        {mode !== "edit" && (
          <Form onSubmit={(event) => void handleSearch(event)} className="mb-3">
            <Label for="card-customer-cpf">CPF do cliente</Label>
            <InputGroup style={{ maxWidth: 360 }}>
              <Input
                id="card-customer-cpf"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={cpfInput}
                onChange={(event) => handleCpfChange(event.target.value)}
                disabled={busy}
                autoFocus
              />
              <Button color="primary" type="submit" disabled={busy || cpfDigits(cpfInput).length !== 11}>
                {searching ? <Spinner size="sm" /> : <i className="ri-search-line" />}
                <span className="ms-1">Buscar</span>
              </Button>
            </InputGroup>
          </Form>
        )}

        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}

        {phase.kind === "search" && mode !== "edit" && !error && (
          <p className="text-muted small mb-0">Informe o CPF para localizar o cliente antes de vincular ou cadastrar.</p>
        )}

        {phase.kind === "outside_boards" && !overrideAvailable && (
          <Alert color="warning" className="mb-0">
            <i className="ri-information-line me-1" />
            Cliente cadastrado fora do seu escritorio ou dos seus quadros. Procure a central.
          </Alert>
        )}

        {overrideAvailable && (
          <>
            <Alert color="warning" className="mb-3">
              <i className="ri-information-line me-1" />
              Cliente cadastrado fora do seu escritorio ou dos seus quadros.
            </Alert>
            <div className="border rounded p-3">
              <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">
                <i className="ri-shield-user-line me-1" />
                Vinculo pelo administrador
              </p>
              <p className="small mb-3">
                Como administrador do Flow, voce pode vincular este cliente ao card. Os dados do cliente ficam
                visiveis depois do vinculo. <strong>A acao e auditada:</strong> o motivo fica registrado no historico
                do card e na auditoria.
              </p>
              <FormGroup className="mb-0">
                <Label for="card-customer-override-reason">
                  Motivo
                  <span className="text-danger ms-1">*</span>
                </Label>
                <Input
                  id="card-customer-override-reason"
                  type="textarea"
                  rows={3}
                  value={overrideReason}
                  maxLength={OVERRIDE_REASON_MAX_LENGTH}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  disabled={saving}
                  placeholder="Ex.: cliente transferido da base de Campinas para esta base"
                />
                <div className="d-flex justify-content-between text-muted small mt-1">
                  <span>Minimo de {OVERRIDE_REASON_MIN_LENGTH} caracteres. Nao inclua CPF ou dado pessoal.</span>
                  <span>
                    {overrideReason.trim().length}/{OVERRIDE_REASON_MAX_LENGTH}
                  </span>
                </div>
              </FormGroup>
            </div>
          </>
        )}

        {phase.kind === "found" && phase.crossOffice && (
          <Alert color="warning">
            <i className="ri-building-line me-1" />
            {phase.canOverride
              ? "Cliente atendido por outro escritorio. Vincular da ao escritorio deste card acesso ao cadastro do cliente (cada escritorio continua vendo so os proprios cards e documentos)."
              : "Cliente vinculado a outro escritorio. Procure a central para vincular este cliente ao card."}
          </Alert>
        )}

        {phase.kind === "found" && (
          <div className="border rounded p-3">
            <p className="text-muted small mb-2">Cliente encontrado. Confira os dados e vincule ao card.</p>
            <CardCustomerSummary customer={phase.customer} juridicoExpanded />
          </div>
        )}

        {crossOfficeOverride && (
          <FormGroup className="mt-3 mb-0">
            <Label for="card-customer-cross-office-reason">
              Motivo do vinculo entre escritorios
              <span className="text-danger ms-1">*</span>
            </Label>
            <Input
              id="card-customer-cross-office-reason"
              type="textarea"
              rows={3}
              value={overrideReason}
              maxLength={OVERRIDE_REASON_MAX_LENGTH}
              onChange={(event) => setOverrideReason(event.target.value)}
              disabled={saving}
              placeholder="Ex.: cliente tambem atendido pela base de Campinas"
            />
            <div className="d-flex justify-content-between text-muted small mt-1">
              <span>Minimo de {OVERRIDE_REASON_MIN_LENGTH} caracteres. Acao auditada; nao inclua CPF ou dado pessoal.</span>
              <span>
                {overrideReason.trim().length}/{OVERRIDE_REASON_MAX_LENGTH}
              </span>
            </div>
          </FormGroup>
        )}

        {phase.kind === "not_found" && (
          <Alert color="info" className="py-2">
            Nenhum cliente com este CPF. Preencha o cadastro para criar e vincular ao card.
          </Alert>
        )}

        {showForm && (
          <Row className="g-4">
            <Col xs={12} lg={3}>
              <div className="nav flex-lg-column nav-pills gap-2">
                {STEPS.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`nav-link text-start${activeStep === index ? " active" : ""}`}
                    onClick={() => setActiveStep(index)}
                  >
                    <i className={`${item.icon} me-2`} />
                    {item.label}
                  </button>
                ))}
              </div>
            </Col>
            <Col xs={12} lg={9}>
              <h6 className="mb-3">{step.label}</h6>
              <Row className="g-3">
                {activeStep === 0 && cpfLabel && (
                  <Col md={6}>
                    <FormGroup className="mb-0">
                      <Label>CPF</Label>
                      <Input value={cpfLabel} disabled readOnly />
                    </FormGroup>
                  </Col>
                )}
                {groupBySection(step.fields).map((group, groupIndex) => (
                  <React.Fragment key={groupIndex}>
                    {group.section && (
                      <Col xs={12}>
                        <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mt-1 mb-0">{group.section}</p>
                      </Col>
                    )}
                    {group.fields.map((field) => (
                      <Col md={field.colMd ?? 6} key={field.name}>
                        <FormGroup className="mb-0">
                          <Label>
                            {field.label}
                            {field.required && <span className="text-danger ms-1">*</span>}
                          </Label>
                          {renderField(field)}
                        </FormGroup>
                      </Col>
                    ))}
                  </React.Fragment>
                ))}
                {step.withHipossuficiencia && (
                  <Col xs={12}>
                    <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mt-1 mb-2">Declaracoes</p>
                    <div className="form-check">
                      <Input
                        id="card-customer-hipossuficiencia"
                        type="checkbox"
                        className="form-check-input"
                        checked={form.hipossuficienciaDeclarada}
                        onChange={(event) => setForm((prev) => ({ ...prev, hipossuficienciaDeclarada: event.target.checked }))}
                        disabled={saving}
                      />
                      <Label for="card-customer-hipossuficiencia" className="form-check-label">
                        Hipossuficiencia declarada
                      </Label>
                    </div>
                  </Col>
                )}
                {activeStep === 0 && phase.kind === "edit" && (
                  <Col xs={12}>
                    <p className="text-muted small mb-0">
                      Campos gerais deixados em branco mantem o valor atual. Para outro CPF, use Trocar cliente.
                    </p>
                  </Col>
                )}
              </Row>
            </Col>
          </Row>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="light" type="button" onClick={onClose} disabled={busy}>
          {canSubmit ? "Cancelar" : "Fechar"}
        </Button>
        {canSubmit && (
          <Button
            color="primary"
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || ((overrideAvailable || crossOfficeOverride) && overrideReasonError !== null)}
          >
            {saving ? (
              <>
                <Spinner size="sm" className="me-1" />
                Salvando
              </>
            ) : (
              <>
                {(overrideAvailable || crossOfficeOverride) && <i className="ri-shield-user-line me-1" />}
                {primaryLabel}
              </>
            )}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
