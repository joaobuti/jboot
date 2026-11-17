"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { CaseTypeDto, DocumentTemplateDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import {
  buildCaseTypePayload,
  CaseTypeForm,
  caseTypeToForm,
  EMPTY_CASE_TYPE_FORM,
  toggleCaseTypeTemplate,
} from "@/modules/kanban/lib/document-templates";

const STEPS = [
  { id: "general", label: "Dados gerais", icon: "ri-file-text-line" },
  { id: "classification", label: "Classificação", icon: "ri-price-tag-3-line" },
  { id: "templates", label: "Modelos", icon: "ri-file-list-3-line" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface CaseTypesPanelProps {
  onForbidden: () => void;
}

/**
 * Tipos de caso do tenant (CRM de leads, Sprint 5) no padrao
 * `skills/platform-crud-ui.md`: listagem + modal com steps. Sem exclusao:
 * inativar. O cadastro comeca vazio (P1: a lista real vem do cliente).
 */
export default function CaseTypesPanel({ onForbidden }: CaseTypesPanelProps) {
  const [caseTypes, setCaseTypes] = useState<CaseTypeDto[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CaseTypeDto | null>(null);
  const [form, setForm] = useState<CaseTypeForm>(EMPTY_CASE_TYPE_FORM);
  const [step, setStep] = useState<StepId>("general");
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [caseTypesResult, templatesResult] = await Promise.all([
        kanbanApi.caseTypes.list(),
        kanbanApi.documentTemplates.list(),
      ]);
      setCaseTypes(caseTypesResult.data);
      setTemplates(templatesResult.data);
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        onForbidden();
      } else {
        setError(describeKanbanError(err, "Erro ao carregar tipos de caso"));
      }
    } finally {
      setLoading(false);
    }
  }, [onForbidden]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_CASE_TYPE_FORM);
    setStep("general");
    setFormError(null);
    setModalOpen(true);
  }

  async function openEdit(caseType: CaseTypeDto) {
    setOpening(caseType.id);
    setError(null);
    try {
      // Dado fresco do backend (outro administrador pode ter alterado).
      const fresh = await kanbanApi.caseTypes.get(caseType.id);
      setEditing(fresh);
      setForm(caseTypeToForm(fresh));
      setStep("general");
      setFormError(null);
      setModalOpen(true);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao abrir tipo de caso"));
    } finally {
      setOpening(null);
    }
  }

  function close() {
    if (!saving) {
      setModalOpen(false);
      setEditing(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setStep("general");
      setFormError("Informe o nome do tipo de caso.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildCaseTypePayload(form);
      if (editing) {
        await kanbanApi.caseTypes.update(editing.id, payload);
      } else {
        await kanbanApi.caseTypes.create(payload);
      }
      setModalOpen(false);
      setEditing(null);
      setSuccess(editing ? "Tipo de caso atualizado." : "Tipo de caso cadastrado.");
      await load();
    } catch (err) {
      setFormError(describeKanbanError(err, "Erro ao salvar tipo de caso"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(caseType: CaseTypeDto) {
    setBusyId(caseType.id);
    setError(null);
    setSuccess(null);
    try {
      await kanbanApi.caseTypes.update(caseType.id, { active: !caseType.active });
      await load();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao alterar tipo de caso"));
    } finally {
      setBusyId(null);
    }
  }

  // Vinculo novo so com modelo ativo; vinculo ja existente a modelo inativo continua visivel.
  const selectableTemplates = templates.filter((template) => template.active || form.templateIds.includes(template.id));
  const defaultName = (caseType: CaseTypeDto) =>
    caseType.templates.find((template) => template.id === caseType.defaultTemplateId)?.name ?? null;

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <>
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="success" toggle={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      <Card>
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h5 className="mb-0">Tipos de caso</h5>
          <Button color="primary" size="sm" onClick={openCreate}>
            <i className="ri-add-line align-bottom me-1" />
            Novo tipo de caso
          </Button>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            Tipo de caso inativo não aparece para classificação nem geração de documento. O modelo padrão é usado na
            geração; o gestor pode escolher outro entre os vinculados.
          </p>
          {caseTypes.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">Nenhum tipo de caso cadastrado.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Tipo de caso</th>
                    <th>Modelo padrão</th>
                    <th>Modelos vinculados</th>
                    <th>Situação</th>
                    <th className="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {caseTypes.map((caseType) => (
                    <tr key={caseType.id}>
                      <td>{caseType.name}</td>
                      <td>{defaultName(caseType) ?? <span className="text-muted">Sem modelo padrão</span>}</td>
                      <td>{caseType.templates.length}</td>
                      <td>
                        <span className={`badge ${caseType.active ? "bg-success-subtle text-success" : "bg-dark-subtle text-dark"}`}>
                          {caseType.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          color="primary"
                          outline
                          className="me-1"
                          onClick={() => void openEdit(caseType)}
                          disabled={opening === caseType.id}
                        >
                          {opening === caseType.id ? <Spinner size="sm" /> : "Editar"}
                        </Button>
                        <Button
                          size="sm"
                          color={caseType.active ? "danger" : "success"}
                          outline
                          onClick={() => void toggleActive(caseType)}
                          disabled={busyId === caseType.id}
                        >
                          {busyId === caseType.id ? <Spinner size="sm" /> : caseType.active ? "Inativar" : "Reativar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} toggle={close} centered size="xl">
        <Form onSubmit={(event) => void submit(event)}>
          <ModalHeader toggle={close}>{editing ? "Editar tipo de caso" : "Novo tipo de caso"}</ModalHeader>
          <ModalBody>
            {formError && <Alert color="danger">{formError}</Alert>}
            <Row className="g-4">
              <Col xs={12} lg={3}>
                <div className="nav flex-lg-column nav-pills gap-2">
                  {STEPS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-link text-start${step === item.id ? " active" : ""}`}
                      onClick={() => setStep(item.id)}
                    >
                      <i className={`${item.icon} me-2`} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </Col>
              <Col xs={12} lg={9}>
                <h6 className="mb-3">{STEPS.find((item) => item.id === step)?.label}</h6>
                {step === "general" && (
                  <Row className="g-3">
                    <Col xs={12}>
                      <FormGroup className="mb-0">
                        <Label for="case-type-name">
                          Nome<span className="text-danger ms-1">*</span>
                        </Label>
                        <Input
                          id="case-type-name"
                          value={form.name}
                          maxLength={160}
                          onChange={(event) => setForm({ ...form, name: event.target.value })}
                          disabled={saving}
                          autoFocus
                        />
                      </FormGroup>
                    </Col>
                    <Col xs={12}>
                      <FormGroup className="mb-0">
                        <Label for="case-type-description">Descrição</Label>
                        <Input
                          id="case-type-description"
                          type="textarea"
                          rows={3}
                          maxLength={2000}
                          value={form.description}
                          onChange={(event) => setForm({ ...form, description: event.target.value })}
                          disabled={saving}
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                )}
                {step === "classification" && (
                  <Row className="g-3">
                    <Col xs={12}>
                      <FormGroup className="mb-0">
                        <Label for="case-type-criteria">Critérios de classificação</Label>
                        <Input
                          id="case-type-criteria"
                          type="textarea"
                          rows={6}
                          maxLength={8000}
                          value={form.classificationCriteria}
                          onChange={(event) => setForm({ ...form, classificationCriteria: event.target.value })}
                          disabled={saving}
                          placeholder="O que a central observa para decidir que o lead é deste tipo de caso."
                        />
                      </FormGroup>
                    </Col>
                    <Col xs={12}>
                      <FormGroup className="mb-0">
                        <Label for="case-type-evidence">Evidências e documentos esperados</Label>
                        <Input
                          id="case-type-evidence"
                          type="textarea"
                          rows={4}
                          maxLength={4000}
                          value={form.expectedEvidence}
                          onChange={(event) => setForm({ ...form, expectedEvidence: event.target.value })}
                          disabled={saving}
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                )}
                {step === "templates" &&
                  (selectableTemplates.length === 0 ? (
                    <p className="text-muted mb-0">
                      Nenhum modelo ativo cadastrado. Cadastre modelos na aba Modelos e volte para vincular.
                    </p>
                  ) : (
                    <div className="table-responsive">
                      <Table className="table-nowrap align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{ width: 90 }}>Vincular</th>
                            <th>Modelo</th>
                            <th style={{ width: 110 }}>Padrão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectableTemplates.map((template) => {
                            const linked = form.templateIds.includes(template.id);
                            return (
                              <tr key={template.id}>
                                <td>
                                  <Input
                                    type="checkbox"
                                    aria-label={`Vincular ${template.name}`}
                                    checked={linked}
                                    onChange={(event) =>
                                      setForm(toggleCaseTypeTemplate(form, template.id, event.target.checked))
                                    }
                                    disabled={saving}
                                  />
                                </td>
                                <td>
                                  {template.name}
                                  {!template.active && <span className="badge bg-dark-subtle text-dark ms-2">Inativo</span>}
                                  {template.currentVersion?.validationStatus !== "valid" && (
                                    <span className="badge bg-warning-subtle text-warning ms-2">
                                      {template.currentVersion ? "Variáveis desconhecidas" : "Sem arquivo"}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <Input
                                    type="radio"
                                    name="case-type-default-template"
                                    aria-label={`Padrão: ${template.name}`}
                                    checked={form.defaultTemplateId === template.id}
                                    onChange={() => setForm({ ...form, defaultTemplateId: template.id })}
                                    disabled={saving || !linked}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  ))}
              </Col>
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="light" type="button" onClick={close} disabled={saving}>
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner size="sm" className="me-1" />
                  Salvando
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </>
  );
}
