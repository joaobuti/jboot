"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
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
  Table
} from "reactstrap";
import { PageResult, PdvPayload } from "@/modules/pdv/lib/pdv-api";
import { CepInput, CepAddress } from "@/components/Common/CepInput";
import { CurrencyInput } from "@/components/Common/CurrencyInput";

export interface CepMapping {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  ibgeCode?: string;
  complement?: string;
}

export interface PdvStep {
  label: string;
  icon: string;
}

export interface PdvField {
  name: string;
  label: string;
  section?: string;
  type?: "text" | "number" | "checkbox" | "select" | "cep" | "currency";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  colMd?: number;
  cepMapping?: CepMapping;
  step?: number;
}

export interface PdvColumn<T> {
  key: keyof T;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface PdvAdminPageProps<T extends { id: string; status?: string }> {
  title: string;
  subtitle: string;
  columns: Array<PdvColumn<T>>;
  fields: PdvField[];
  steps?: PdvStep[];
  renderStepExtra?: (
    step: number,
    form: PdvPayload,
    setForm: React.Dispatch<React.SetStateAction<PdvPayload>>,
    isEditing: boolean,
    editingId?: string,
    editing?: T | null,
    onExternalUpdate?: (row: T) => void
  ) => React.ReactNode;
  load: (params?: { limit?: number; offset?: number; search?: string; status?: string }) => Promise<PageResult<T>>;
  create?: (payload: PdvPayload) => Promise<T>;
  update?: (id: string, payload: PdvPayload) => Promise<T>;
  remove?: (id: string) => Promise<void>;
  createLabel?: string;
}

export function PdvAdminPage<T extends { id: string; status?: string }>({
  title,
  columns,
  fields,
  steps,
  renderStepExtra,
  load,
  create,
  update,
  remove,
  createLabel
}: PdvAdminPageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<PdvPayload>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const loadRef = useRef(load);
  loadRef.current = load;

  const canMutate = Boolean(create || update);

  const emptyForm = useMemo(() => {
    return fields.reduce<PdvPayload>((acc, field) => {
      acc[field.name] = field.type === "checkbox" ? false : "";
      return acc;
    }, {});
  }, [fields]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadRef.current({ limit: 20, offset: 0 });
      setRows(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setActiveStep(1);
    setModalOpen(true);
  }

  function startEdit(row: T) {
    setEditing(row);
    setForm(
      fields.reduce<PdvPayload>((acc, field) => {
        const value = row[field.name as keyof T];
        acc[field.name] = typeof value === "boolean" || typeof value === "string" ? value : value == null ? "" : String(value);
        return acc;
      }, {})
    );
    setActiveStep(1);
    setModalOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing && update) {
        await update(editing.id, normalizePayload(form));
      } else if (create) {
        await create(normalizePayload(form));
      }
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function inactivate(row: T) {
    if (!remove) {
      return;
    }
    if (!confirm("Inativar este registro?")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await remove(row.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao inativar");
    } finally {
      setSaving(false);
    }
  }

  function applyExternalUpdate(row: T) {
    setEditing(row);
    setRows((current) => current.map((item) => item.id === row.id ? row : item));
  }

  return (
    <div className="page-content">
      <Row>
        <Col lg={12}>
          <Card>
            <CardHeader className="d-flex align-items-center justify-content-between">
              <h5 className="mb-0">{title}</h5>
              {canMutate && (
                <Button color="primary" size="sm" onClick={startCreate}>
                  <i className="ri-add-line align-bottom me-1" />
                  {createLabel ?? "Novo"}
                </Button>
              )}
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              {loading ? (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                </div>
              ) : rows.length === 0 ? (
                <p className="text-muted text-center py-4 mb-0">Nenhum registro encontrado.</p>
              ) : (
                <div className="table-responsive">
                  <Table className="table-nowrap mb-0" hover>
                    <thead className="table-light">
                      <tr>
                        {columns.map((column) => (
                          <th key={String(column.key)}>{column.label}</th>
                        ))}
                        {canMutate && <th className="text-end">Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          {columns.map((column) => (
                            <td key={String(column.key)}>{renderCell(row, column)}</td>
                          ))}
                          {canMutate && (
                            <td className="text-end">
                              <Button size="sm" color="primary" outline className="me-1" onClick={() => startEdit(row)}>
                                Editar
                              </Button>
                              {remove && row.status !== "inactive" && (
                                <Button size="sm" color="danger" outline onClick={() => void inactivate(row)}>
                                  Inativar
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {canMutate && (
        <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} centered size="xl">
          <Form onSubmit={submit}>
            <ModalHeader toggle={() => setModalOpen(false)}>
              {editing ? `Editar ${title}` : createLabel ?? `Novo ${title}`}
            </ModalHeader>
            <ModalBody>
              <Row className="g-4">
                <Col xs={12} lg={3}>
                  <div className="nav flex-lg-column nav-pills gap-2">
                    {steps ? steps.map((step, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`nav-link text-start${activeStep === idx + 1 ? " active" : ""}`}
                        onClick={() => setActiveStep(idx + 1)}
                      >
                        <i className={`${step.icon} me-2`} />
                        {step.label}
                      </button>
                    )) : (
                      <button type="button" className="nav-link text-start active">
                        <i className="ri-file-text-line me-2" />
                        Dados
                      </button>
                    )}
                  </div>
                </Col>
                <Col xs={12} lg={9}>
                  <h6 className="mb-3">{steps ? steps[activeStep - 1]?.label : "Dados do cadastro"}</h6>
                  <Row className="g-3">
                    {groupFieldsBySection(
                      steps ? fields.filter((f) => (f.step ?? 1) === activeStep) : fields
                    ).map((group, gi) => (
                      <React.Fragment key={gi}>
                        {group.section && (
                          <Col xs={12}>
                            <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mt-1 mb-0">
                              {group.section}
                            </p>
                          </Col>
                        )}
                        {group.fields.map((field) => (
                          <Col md={field.colMd ?? (field.type === "checkbox" ? 4 : 6)} key={field.name}>
                            <FormGroup className="mb-0">
                              <Label>{field.label}{field.required && <span className="text-danger ms-1">*</span>}</Label>
                              {field.type === "cep" ? (
                                <CepInput
                                  value={String(form[field.name] ?? "")}
                                  onChange={(v) => setForm((prev) => ({ ...prev, [field.name]: v }))}
                                  onAddressFound={field.cepMapping ? buildCepHandler(field.cepMapping, setForm) : undefined}
                                  required={field.required}
                                />
                              ) : field.type === "currency" ? (
                                <CurrencyInput
                                  value={String(form[field.name] ?? "")}
                                  onChange={(raw) => setForm((prev) => ({ ...prev, [field.name]: raw }))}
                                  required={field.required}
                                />
                              ) : field.type === "select" ? (
                                <Input
                                  type="select"
                                  value={String(form[field.name] ?? "")}
                                  required={field.required}
                                  onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                                >
                                  <option value="">{field.placeholder ?? "Selecione"}</option>
                                  {field.options?.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Input>
                              ) : field.type === "checkbox" ? (
                                <div className="form-check mt-2">
                                  <Input
                                    type="checkbox"
                                    checked={Boolean(form[field.name])}
                                    onChange={(event) => setForm({ ...form, [field.name]: event.target.checked })}
                                  />
                                </div>
                              ) : (
                                <Input
                                  type={field.type ?? "text"}
                                  value={String(form[field.name] ?? "")}
                                  required={field.required}
                                  onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                                />
                              )}
                            </FormGroup>
                          </Col>
                        ))}
                      </React.Fragment>
                    ))}
                  </Row>
                  {renderStepExtra && renderStepExtra(activeStep, form, setForm, editing !== null, editing?.id, editing, applyExternalUpdate)}
                </Col>
              </Row>
            </ModalBody>
            <ModalFooter>
              <Button color="light" type="button" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button color="primary" type="submit" disabled={saving}>
                {saving ? <><Spinner size="sm" className="me-1" />Salvando</> : "Salvar"}
              </Button>
            </ModalFooter>
          </Form>
        </Modal>
      )}
    </div>
  );
}

function renderCell<T extends { id: string; status?: string }>(row: T, column: PdvColumn<T>): React.ReactNode {
  if (column.render) {
    return column.render(row);
  }
  const value = row[column.key];
  if (column.key === "status") {
    const status = String(value ?? "");
    return (
      <Badge color={status === "active" ? "success" : "secondary"}>
        {status === "active" ? "Ativo" : status === "inactive" ? "Inativo" : status || "—"}
      </Badge>
    );
  }
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }
  return String(value ?? "—");
}

function normalizePayload(payload: PdvPayload): PdvPayload {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, value === "" ? null : value])
  );
}

function buildCepHandler(
  mapping: CepMapping,
  setForm: React.Dispatch<React.SetStateAction<PdvPayload>>
) {
  return (addr: CepAddress) => {
    setForm((prev) => ({
      ...prev,
      ...(mapping.street     && addr.logradouro  ? { [mapping.street]:      addr.logradouro  } : {}),
      ...(mapping.neighborhood && addr.bairro    ? { [mapping.neighborhood]: addr.bairro      } : {}),
      ...(mapping.city       && addr.localidade  ? { [mapping.city]:         addr.localidade  } : {}),
      ...(mapping.state      && addr.uf          ? { [mapping.state]:        addr.uf          } : {}),
      ...(mapping.ibgeCode   && addr.ibge        ? { [mapping.ibgeCode]:     addr.ibge        } : {}),
      ...(mapping.complement && addr.complemento ? { [mapping.complement]:   addr.complemento } : {}),
    }));
  };
}

function groupFieldsBySection(fields: PdvField[]): Array<{ section: string | undefined; fields: PdvField[] }> {
  return fields.reduce<Array<{ section: string | undefined; fields: PdvField[] }>>((acc, field) => {
    const last = acc[acc.length - 1];
    if (last && last.section === field.section) {
      last.fields.push(field);
    } else {
      acc.push({ section: field.section, fields: [field] });
    }
    return acc;
  }, []);
}
