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
import {
  DocumentTemplateDetailDto,
  DocumentTemplateDto,
  KanbanApiError,
  kanbanApi,
  TemplateVersionDetailDto,
  TemplateVersionDto,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import {
  describeTemplateWarning,
  formatBytes,
  TEMPLATE_ACCEPT,
  templateErrorDetails,
  validateTemplateFile,
  variableRequirementChanges,
  versionStatusBadge,
} from "@/modules/kanban/lib/document-templates";
import { formatLeadDate } from "@/modules/kanban/lib/leads";
import TemplateVariablesCatalogModal from "@/modules/kanban/components/leads/TemplateVariablesCatalogModal";

const STEPS = [
  { id: "general", label: "Dados gerais", icon: "ri-file-text-line" },
  { id: "file", label: "Arquivo e versões", icon: "ri-file-word-line" },
  { id: "variables", label: "Variáveis", icon: "ri-braces-line" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface FormErrorState {
  message: string;
  items: string[];
}

function toFormError(err: unknown, fallback: string): FormErrorState {
  if (err instanceof KanbanApiError) {
    const details = templateErrorDetails(err);
    if (details) {
      return details;
    }
  }
  return { message: describeKanbanError(err, fallback), items: [] };
}

interface DocumentTemplatesPanelProps {
  onForbidden: () => void;
}

/**
 * Modelos de documento do tenant (CRM de leads, Sprint 5) no padrao
 * `skills/platform-crud-ui.md`. Trocar o arquivo cria versao nova (a anterior
 * fica no historico, imutavel); variavel desconhecida deixa a versao
 * inutilizavel ate o envio de versao corrigida. Toda validacao e do backend.
 */
export default function DocumentTemplatesPanel({ onForbidden }: DocumentTemplatesPanelProps) {
  const [templates, setTemplates] = useState<DocumentTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<DocumentTemplateDetailDto | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [required, setRequired] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<StepId>("general");
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormErrorState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewedVersion, setViewedVersion] = useState<TemplateVersionDetailDto | null>(null);
  const [versionBusy, setVersionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTemplates((await kanbanApi.documentTemplates.list()).data);
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) {
        onForbidden();
      } else {
        setError(describeKanbanError(err, "Erro ao carregar modelos"));
      }
    } finally {
      setLoading(false);
    }
  }, [onForbidden]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyDetail(next: DocumentTemplateDetailDto | null) {
    setDetail(next);
    setName(next?.name ?? "");
    setDescription(next?.description ?? "");
    setRequired(Object.fromEntries((next?.current?.variables ?? []).map((variable) => [variable.key, variable.required])));
    setViewedVersion(null);
  }

  function resetFile() {
    setFile(null);
    setFileInputKey((key) => key + 1);
  }

  function openCreate() {
    applyDetail(null);
    resetFile();
    setStep("general");
    setFormError(null);
    setNotice(null);
    setModalOpen(true);
  }

  async function openEdit(template: DocumentTemplateDto) {
    setOpening(template.id);
    setError(null);
    try {
      applyDetail(await kanbanApi.documentTemplates.get(template.id));
      resetFile();
      setStep("general");
      setFormError(null);
      setNotice(null);
      setModalOpen(true);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao abrir modelo"));
    } finally {
      setOpening(null);
    }
  }

  function close() {
    if (!saving) {
      setModalOpen(false);
      applyDetail(null);
    }
  }

  function chooseFile(selected: File | null) {
    setFormError(null);
    if (selected) {
      const problem = validateTemplateFile(selected);
      if (problem) {
        setFormError({ message: problem, items: [] });
        resetFile();
        return;
      }
    }
    setFile(selected);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setStep("general");
      setFormError({ message: "Informe o nome do modelo.", items: [] });
      return;
    }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    let current = detail;
    try {
      const normalizedDescription = description.trim() === "" ? null : description.trim();
      if (!current) {
        current = await kanbanApi.documentTemplates.create({ name: trimmed, description: normalizedDescription });
        applyDetail(current);
      } else if (trimmed !== current.name || normalizedDescription !== current.description) {
        current = await kanbanApi.documentTemplates.update(current.id, { name: trimmed, description: normalizedDescription });
      }
      const changes = current.current ? variableRequirementChanges(current.current.variables, required) : [];
      if (current.current && changes.length > 0) {
        await kanbanApi.documentTemplates.updateVariables(current.id, current.current.id, changes);
      }
      let uploaded: TemplateVersionDetailDto | null = null;
      if (file) {
        try {
          uploaded = await kanbanApi.documentTemplates.uploadVersion(current.id, file);
        } catch (err) {
          // Modelo (e dados gerais) ja salvos: o modal passa a edicao e mostra o motivo da recusa.
          applyDetail(await kanbanApi.documentTemplates.get(current.id));
          setStep("file");
          setFormError(toFormError(err, "Erro ao enviar o arquivo"));
          await load();
          return;
        }
      }
      await load();
      if (uploaded && (uploaded.validationStatus !== "valid" || uploaded.warnings.length > 0)) {
        applyDetail(await kanbanApi.documentTemplates.get(current.id));
        resetFile();
        setStep(uploaded.validationStatus !== "valid" ? "variables" : "file");
        setNotice(
          uploaded.validationStatus !== "valid"
            ? `Versão ${uploaded.version} salva, mas com variáveis fora do catálogo. Ela não será usada na geração até você enviar uma versão corrigida.`
            : `Versão ${uploaded.version} salva e pronta para uso. Confira os avisos abaixo.`
        );
        return;
      }
      setModalOpen(false);
      applyDetail(null);
      setSuccess(uploaded ? `Modelo salvo. Versão ${uploaded.version} pronta para uso.` : "Modelo salvo.");
    } catch (err) {
      setFormError(toFormError(err, "Erro ao salvar modelo"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template: DocumentTemplateDto) {
    setBusyId(template.id);
    setError(null);
    setSuccess(null);
    try {
      await kanbanApi.documentTemplates.update(template.id, { active: !template.active });
      await load();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao alterar modelo"));
    } finally {
      setBusyId(null);
    }
  }

  async function download(version: TemplateVersionDto) {
    if (!detail) {
      return;
    }
    setVersionBusy(`download:${version.id}`);
    try {
      const { url } = await kanbanApi.documentTemplates.download(detail.id, version.id);
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (err) {
      setFormError(toFormError(err, "Erro ao gerar link de download"));
    } finally {
      setVersionBusy(null);
    }
  }

  async function viewVersion(version: TemplateVersionDto) {
    if (!detail) {
      return;
    }
    if (viewedVersion?.id === version.id) {
      setViewedVersion(null);
      return;
    }
    setVersionBusy(`view:${version.id}`);
    try {
      setViewedVersion(await kanbanApi.documentTemplates.getVersion(detail.id, version.id));
    } catch (err) {
      setFormError(toFormError(err, "Erro ao carregar a versão"));
    } finally {
      setVersionBusy(null);
    }
  }

  const currentVersion = detail?.current ?? null;

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
          <h5 className="mb-0">Modelos de documento</h5>
          <div className="d-flex gap-2">
            <Button color="primary" outline size="sm" onClick={() => setCatalogOpen(true)}>
              <i className="ri-braces-line align-bottom me-1" />
              Variáveis disponíveis
            </Button>
            <Button color="primary" size="sm" onClick={openCreate}>
              <i className="ri-add-line align-bottom me-1" />
              Novo modelo
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            O modelo é editado no Word e enviado em .docx. Enviar um arquivo novo cria uma versão; as anteriores ficam no
            histórico. A geração usa só a versão atual pronta para uso.
          </p>
          {templates.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">Nenhum modelo cadastrado.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Modelo</th>
                    <th>Versão atual</th>
                    <th>Arquivo</th>
                    <th>Tipos de caso</th>
                    <th>Situação</th>
                    <th className="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => {
                    const badge = versionStatusBadge(template.currentVersion?.validationStatus ?? null);
                    return (
                      <tr key={template.id}>
                        <td>{template.name}</td>
                        <td>
                          {template.currentVersion
                            ? `v${template.currentVersion.version} · ${formatLeadDate(template.currentVersion.createdAt)}`
                            : "-"}
                        </td>
                        <td>
                          <span className={`badge ${badge.className}`}>{badge.label}</span>
                        </td>
                        <td>{template.caseTypeCount}</td>
                        <td>
                          <span className={`badge ${template.active ? "bg-success-subtle text-success" : "bg-dark-subtle text-dark"}`}>
                            {template.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="text-end">
                          <Button
                            size="sm"
                            color="primary"
                            outline
                            className="me-1"
                            onClick={() => void openEdit(template)}
                            disabled={opening === template.id}
                          >
                            {opening === template.id ? <Spinner size="sm" /> : "Editar"}
                          </Button>
                          <Button
                            size="sm"
                            color={template.active ? "danger" : "success"}
                            outline
                            onClick={() => void toggleActive(template)}
                            disabled={busyId === template.id}
                          >
                            {busyId === template.id ? <Spinner size="sm" /> : template.active ? "Inativar" : "Reativar"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <TemplateVariablesCatalogModal isOpen={catalogOpen} toggle={() => setCatalogOpen(false)} />

      <Modal isOpen={modalOpen} toggle={close} centered size="xl">
        <Form onSubmit={(event) => void submit(event)}>
          <ModalHeader toggle={close}>{detail ? "Editar modelo" : "Novo modelo"}</ModalHeader>
          <ModalBody>
            {formError && (
              <Alert color="danger">
                {formError.message}
                {formError.items.length > 0 && (
                  <ul className="mb-0 mt-2">
                    {formError.items.map((item) => (
                      <li key={item}>
                        <code>{item}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
            {notice && <Alert color="warning">{notice}</Alert>}
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
                        <Label for="template-name">
                          Nome<span className="text-danger ms-1">*</span>
                        </Label>
                        <Input
                          id="template-name"
                          value={name}
                          maxLength={160}
                          onChange={(event) => setName(event.target.value)}
                          disabled={saving}
                          autoFocus
                        />
                      </FormGroup>
                    </Col>
                    <Col xs={12}>
                      <FormGroup className="mb-0">
                        <Label for="template-description">Descrição</Label>
                        <Input
                          id="template-description"
                          type="textarea"
                          rows={3}
                          maxLength={2000}
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          disabled={saving}
                        />
                      </FormGroup>
                    </Col>
                    {detail && detail.caseTypes.length > 0 && (
                      <Col xs={12}>
                        <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">
                          Tipos de caso vinculados
                        </p>
                        {detail.caseTypes.map((caseType) => (
                          <span key={caseType.id} className="badge bg-info-subtle text-info me-1 mb-1">
                            {caseType.name}
                            {caseType.isDefault ? " (padrão)" : ""}
                            {!caseType.active ? " (inativo)" : ""}
                          </span>
                        ))}
                      </Col>
                    )}
                  </Row>
                )}

                {step === "file" && (
                  <>
                    <FormGroup>
                      <Label for="template-file">{detail?.currentVersion ? "Enviar nova versão" : "Arquivo do modelo"}</Label>
                      <Input
                        key={fileInputKey}
                        id="template-file"
                        type="file"
                        accept={TEMPLATE_ACCEPT}
                        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                        disabled={saving}
                      />
                      <div className="form-text">
                        Word (.docx), até 10 MB, sem macro, sem objeto incorporado e sem imagem por link. O arquivo é
                        validado ao salvar.
                        {file ? ` Selecionado: ${file.name}.` : ""}
                      </div>
                    </FormGroup>
                    {detail && detail.versions.length > 0 && (
                      <>
                        <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">
                          <i className="ri-history-line me-1" />
                          Versões
                        </p>
                        <div className="table-responsive">
                          <Table className="table-sm table-nowrap align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Versão</th>
                                <th>Enviada em</th>
                                <th>Arquivo</th>
                                <th>Situação</th>
                                <th className="text-end">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.versions.map((version) => {
                                const badge = versionStatusBadge(version.validationStatus);
                                return (
                                  <tr key={version.id}>
                                    <td>
                                      v{version.version}
                                      {version.isCurrent && <span className="badge bg-primary-subtle text-primary ms-2">Atual</span>}
                                    </td>
                                    <td>{formatLeadDate(version.createdAt)}</td>
                                    <td className="text-truncate" style={{ maxWidth: 220 }} title={version.fileName}>
                                      {version.fileName} · {formatBytes(version.sizeBytes)}
                                    </td>
                                    <td>
                                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                                    </td>
                                    <td className="text-end">
                                      <Button
                                        size="sm"
                                        color="light"
                                        className="me-1"
                                        onClick={() => void viewVersion(version)}
                                        disabled={versionBusy === `view:${version.id}`}
                                      >
                                        {viewedVersion?.id === version.id ? "Ocultar" : "Detalhes"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        color="light"
                                        title="Baixar o arquivo enviado"
                                        aria-label={`Baixar versão ${version.version}`}
                                        onClick={() => void download(version)}
                                        disabled={versionBusy === `download:${version.id}`}
                                      >
                                        <i className="ri-download-2-line" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        </div>
                        {viewedVersion && (
                          <div className="border rounded p-2 mt-2 small">
                            <div className="mb-1">
                              v{viewedVersion.version} · catálogo v{viewedVersion.catalogVersion} · sha256{" "}
                              <code>{viewedVersion.sha256.slice(0, 12)}…</code>
                            </div>
                            {viewedVersion.unknownVariables.length > 0 && (
                              <div className="text-warning">
                                Fora do catálogo: {viewedVersion.unknownVariables.map((key) => `{{${key}}}`).join(", ")}
                              </div>
                            )}
                            {viewedVersion.warnings.map((warning, index) => (
                              <div key={index} className="text-muted">
                                {describeTemplateWarning(warning)}
                              </div>
                            ))}
                            <div className="text-muted">
                              Variáveis: {viewedVersion.variables.map((variable) => variable.key).join(", ") || "nenhuma"}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {step === "variables" &&
                  (!currentVersion ? (
                    <p className="text-muted mb-0">Envie o arquivo do modelo para ver as variáveis encontradas.</p>
                  ) : (
                    <>
                      {currentVersion.unknownVariables.length > 0 && (
                        <Alert color="warning" className="small">
                          A versão atual (v{currentVersion.version}) tem variáveis fora do catálogo e não será usada na
                          geração. Corrija no Word (veja &quot;Variáveis disponíveis&quot;) e envie uma nova versão.
                        </Alert>
                      )}
                      {currentVersion.warnings.map((warning, index) => (
                        <Alert key={index} color="info" className="small py-2">
                          {describeTemplateWarning(warning)}
                        </Alert>
                      ))}
                      {currentVersion.variables.length === 0 ? (
                        <p className="text-muted mb-0">O modelo não tem variáveis.</p>
                      ) : (
                        <div className="table-responsive">
                          <Table className="table-sm align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Variável</th>
                                <th>Descrição</th>
                                <th style={{ width: 120 }}>Obrigatória</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentVersion.variables.map((variable) => (
                                <tr key={variable.key}>
                                  <td>
                                    <code>{`{{${variable.key}}}`}</code>
                                  </td>
                                  <td>
                                    {variable.known ? (
                                      variable.label
                                    ) : (
                                      <span className="badge bg-warning-subtle text-warning">Fora do catálogo</span>
                                    )}
                                  </td>
                                  <td>
                                    <div className="form-check form-switch mb-0">
                                      <Input
                                        type="switch"
                                        role="switch"
                                        className="form-check-input"
                                        aria-label={`Obrigatória: ${variable.key}`}
                                        checked={required[variable.key] ?? variable.required}
                                        onChange={(event) =>
                                          setRequired((previous) => ({ ...previous, [variable.key]: event.target.checked }))
                                        }
                                        disabled={saving || !variable.known}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                          <div className="form-text">
                            Obrigatória sem valor impede a geração e lista o campo; opcional sem valor sai como
                            [PREENCHER: campo].
                          </div>
                        </div>
                      )}
                    </>
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
