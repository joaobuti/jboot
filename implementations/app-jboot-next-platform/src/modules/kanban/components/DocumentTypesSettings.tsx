"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import {
  BoardColumnDto,
  BoardDocumentTypeDto,
  KanbanApiError,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

interface DocumentTypesSettingsProps {
  boardId: string;
}

interface FormState {
  name: string;
  sortOrder: string;
  required: boolean;
  active: boolean;
}

const EMPTY_FORM: FormState = { name: "", sortOrder: "", required: true, active: true };

// Steps sem numero, com icone por agrupamento (skills/platform-crud-ui.md).
const STEPS = [
  { label: "Dados gerais", icon: "ri-file-text-line" },
  { label: "Checklist", icon: "ri-file-list-3-line" },
] as const;

/**
 * Configuracao do checklist de documentos do quadro (CRM de leads, Sprint 2):
 * CRUD dos tipos (desativar, nunca apagar), lista inicial e colunas que exigem
 * checklist completo. Exclusivo de `board_admin`; o backend recusa os demais.
 */
export default function DocumentTypesSettings({ boardId }: DocumentTypesSettingsProps) {
  const [boardName, setBoardName] = useState<string>("");
  const [types, setTypes] = useState<BoardDocumentTypeDto[]>([]);
  const [columns, setColumns] = useState<BoardColumnDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BoardDocumentTypeDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const board = await kanbanApi.boards.get(boardId);
      setBoardName(board.name);
      if (board.currentUserRole !== "board_admin") {
        setForbidden(true);
        return;
      }
      const [typesResult, columnsResult] = await Promise.all([
        kanbanApi.documentTypes.list(boardId),
        kanbanApi.columns.list(boardId),
      ]);
      setTypes(typesResult.data);
      setColumns(columnsResult.data.sort((a, b) => a.position - b.position));
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(describeKanbanError(err, "Erro ao carregar documentos do quadro"));
      }
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setActiveStep(0);
    setFormError(null);
    setModalOpen(true);
  }

  function startEdit(type: BoardDocumentTypeDto) {
    setEditing(type);
    setForm({ name: type.name, sortOrder: String(type.sortOrder), required: type.required, active: type.active });
    setActiveStep(0);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }
    setModalOpen(false);
    setEditing(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setActiveStep(0);
      setFormError("Informe o nome do documento.");
      return;
    }
    const sortOrder = form.sortOrder.trim() === "" ? undefined : Number(form.sortOrder);
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      setActiveStep(0);
      setFormError("Ordem deve ser um inteiro maior ou igual a zero.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await kanbanApi.documentTypes.update(boardId, editing.id, {
          name,
          required: form.required,
          active: form.active,
          ...(sortOrder !== undefined ? { sortOrder } : {}),
        });
      } else {
        await kanbanApi.documentTypes.create(boardId, { name, required: form.required, sortOrder });
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(
        err instanceof KanbanApiError && err.code === "document_type_name_taken"
          ? "Ja existe um documento ativo com este nome neste quadro."
          : describeKanbanError(err, "Erro ao salvar documento")
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(type: BoardDocumentTypeDto) {
    setBusyId(type.id);
    setError(null);
    try {
      await kanbanApi.documentTypes.update(boardId, type.id, { active: !type.active });
      await load();
    } catch (err) {
      setError(
        err instanceof KanbanApiError && err.code === "document_type_name_taken"
          ? `Nao foi possivel reativar "${type.name}": ja existe um documento ativo com este nome.`
          : describeKanbanError(err, "Erro ao alterar documento")
      );
    } finally {
      setBusyId(null);
    }
  }

  async function applyInitialList() {
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      const result = await kanbanApi.documentTypes.applyInitialList(boardId);
      setTypes(result.data);
      setNotice(
        result.created.length === 0
          ? "Lista inicial ja aplicada: nenhum documento novo."
          : `${result.created.length} documento(s) adicionado(s).` +
              (result.skippedNames.length > 0 ? ` Ja existiam: ${result.skippedNames.join(", ")}.` : "")
      );
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao aplicar lista inicial"));
    } finally {
      setApplying(false);
    }
  }

  async function toggleColumnRequirement(column: BoardColumnDto) {
    setBusyId(column.id);
    setError(null);
    try {
      await kanbanApi.columns.update(boardId, column.id, { requiresCompleteChecklist: !column.requiresCompleteChecklist });
      await load();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao alterar coluna"));
    } finally {
      setBusyId(null);
    }
  }

  const backLink = (
    <Link href={`/flow/boards/${boardId}`} className="btn btn-light btn-sm">
      <i className="ri-arrow-left-line me-1" />
      Voltar ao quadro
    </Link>
  );

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner color="primary" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div>
        <div className="mb-3">{backLink}</div>
        <Alert color="warning">
          <i className="ri-lock-line me-2" />
          Somente o administrador do quadro configura o checklist de documentos.
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h4 className="mb-0">Documentos{boardName ? ` · ${boardName}` : ""}</h4>
        {backLink}
      </div>

      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert color="success" toggle={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Card>
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h5 className="mb-0">Checklist de documentos</h5>
          <div className="d-flex gap-2">
            <Button color="light" size="sm" onClick={() => void applyInitialList()} disabled={applying}>
              {applying ? <Spinner size="sm" className="me-1" /> : <i className="ri-play-list-add-line align-bottom me-1" />}
              Aplicar lista inicial
            </Button>
            <Button color="primary" size="sm" onClick={startCreate}>
              <i className="ri-add-line align-bottom me-1" />
              Novo documento
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {types.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">Nenhum documento configurado.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Documento</th>
                    <th>Obrigatorio</th>
                    <th>Ordem</th>
                    <th>Situacao</th>
                    <th className="text-end">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((type) => (
                    <tr key={type.id}>
                      <td>{type.name}</td>
                      <td>
                        <span className={`badge ${type.required ? "bg-primary-subtle text-primary" : "bg-secondary-subtle text-secondary"}`}>
                          {type.required ? "Sim" : "Nao"}
                        </span>
                      </td>
                      <td>{type.sortOrder}</td>
                      <td>
                        <span className={`badge ${type.active ? "bg-success-subtle text-success" : "bg-dark-subtle text-dark"}`}>
                          {type.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="text-end">
                        <Button size="sm" color="primary" outline className="me-1" onClick={() => startEdit(type)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          color={type.active ? "danger" : "success"}
                          outline
                          onClick={() => void toggleActive(type)}
                          disabled={busyId === type.id}
                        >
                          {busyId === type.id ? <Spinner size="sm" /> : type.active ? "Inativar" : "Reativar"}
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

      <Card>
        <CardHeader>
          <h5 className="mb-0">Colunas que exigem checklist completo</h5>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            O card so entra nestas colunas com todos os documentos obrigatorios ativos aceitos. Cards que ja estao
            na coluna nao sao retirados.
          </p>
          {columns.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">Nenhuma coluna ativa.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Coluna</th>
                    <th className="text-end">Exige checklist completo</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((column) => (
                    <tr key={column.id}>
                      <td>{column.name}</td>
                      <td className="text-end">
                        <div className="form-check form-switch d-inline-block mb-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`column-checklist-${column.id}`}
                            checked={column.requiresCompleteChecklist}
                            disabled={busyId === column.id}
                            onChange={() => void toggleColumnRequirement(column)}
                            aria-label={`Exigir checklist completo em ${column.name}`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} toggle={closeModal} centered size="xl">
        <Form onSubmit={(event) => void submit(event)}>
          <ModalHeader toggle={closeModal}>{editing ? "Editar documento" : "Novo documento"}</ModalHeader>
          <ModalBody>
            {formError && <Alert color="danger">{formError}</Alert>}
            <Row className="g-4">
              <Col xs={12} lg={3}>
                <div className="nav flex-lg-column nav-pills gap-2">
                  {STEPS.map((step, index) => (
                    <button
                      key={step.label}
                      type="button"
                      className={`nav-link text-start${activeStep === index ? " active" : ""}`}
                      onClick={() => setActiveStep(index)}
                    >
                      <i className={`${step.icon} me-2`} />
                      {step.label}
                    </button>
                  ))}
                </div>
              </Col>
              <Col xs={12} lg={9}>
                <h6 className="mb-3">{STEPS[activeStep].label}</h6>
                {activeStep === 0 && (
                  <Row className="g-3">
                    <Col md={8}>
                      <FormGroup className="mb-0">
                        <Label for="document-type-name">
                          Nome<span className="text-danger ms-1">*</span>
                        </Label>
                        <Input
                          id="document-type-name"
                          value={form.name}
                          maxLength={160}
                          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                          disabled={saving}
                          autoFocus
                        />
                      </FormGroup>
                    </Col>
                    <Col md={4}>
                      <FormGroup className="mb-0">
                        <Label for="document-type-order">Ordem</Label>
                        <Input
                          id="document-type-order"
                          type="number"
                          min={0}
                          placeholder="Fim da lista"
                          value={form.sortOrder}
                          onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                          disabled={saving}
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                )}
                {activeStep === 1 && (
                  <Row className="g-3">
                    <Col xs={12}>
                      <div className="form-check form-switch">
                        <Input
                          id="document-type-required"
                          type="checkbox"
                          className="form-check-input"
                          checked={form.required}
                          onChange={(event) => setForm((prev) => ({ ...prev, required: event.target.checked }))}
                          disabled={saving}
                        />
                        <Label for="document-type-required" className="form-check-label">
                          Obrigatorio (conta na completude e no bloqueio de coluna)
                        </Label>
                      </div>
                    </Col>
                    {editing && (
                      <Col xs={12}>
                        <div className="form-check form-switch">
                          <Input
                            id="document-type-active"
                            type="checkbox"
                            className="form-check-input"
                            checked={form.active}
                            onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                            disabled={saving}
                          />
                          <Label for="document-type-active" className="form-check-label">
                            Ativo (inativo some do checklist novo; envios anteriores ficam no historico)
                          </Label>
                        </div>
                      </Col>
                    )}
                  </Row>
                )}
              </Col>
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="light" type="button" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" className="me-1" /> : null}
              Salvar
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </div>
  );
}
