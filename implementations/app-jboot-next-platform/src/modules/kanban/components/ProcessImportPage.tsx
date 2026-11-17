"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, Col, FormGroup, Input, Label, Row, Spinner, Table } from "reactstrap";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import {
  KanbanApiError,
  kanbanApi,
  ProcessImportOptionsDto,
  ProcessImportPreviewRowDto,
  ProcessImportStatusDto,
} from "@/modules/kanban/lib/kanban-api";
import {
  buildRows,
  ColumnMapping,
  detectColumns,
  ERROR_MESSAGES,
  FIELD_LABEL,
  ImportField,
  ImportRowPayload,
  LOT_FAILURE_LABEL,
  MAX_IMPORT_ROWS,
  ParsedSheet,
  PROBLEM_LABEL,
  readSpreadsheet,
  REQUIRED_FIELDS,
  ROW_ERROR_LABEL,
  WARNING_LABEL,
  XLSX_MIME,
} from "@/modules/kanban/lib/process-import";

type Step = "upload" | "review" | "result";
type Filter = "all" | "ready" | "invalid" | "existing";

const STEPS: Array<{ id: Step; label: string; icon: string }> = [
  { id: "upload", label: "Planilha", icon: "ri-file-excel-2-line" },
  { id: "review", label: "Conferência", icon: "ri-list-check-2" },
  { id: "result", label: "Importação", icon: "ri-checkbox-circle-line" },
];

const PREVIEW_BADGE: Record<ProcessImportPreviewRowDto["status"], { label: string; color: string }> = {
  ready: { label: "Pronta", color: "success" },
  invalid: { label: "Com erro", color: "danger" },
  existing: { label: "Já existe", color: "warning" },
};

const RESULT_BADGE: Record<ProcessImportStatusDto["rows"][number]["status"], { label: string; color: string }> = {
  pending: { label: "Aguardando", color: "secondary" },
  created: { label: "Criado", color: "success" },
  existing: { label: "Já existia", color: "warning" },
  failed: { label: "Falhou", color: "danger" },
};

const CUSTOMER_LABEL: Record<string, string> = { new: "Cliente novo", existing: "Cliente cadastrado", unknown: "Cliente pelo CPF" };

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof KanbanApiError && error.code && ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code];
  return describeKanbanError(error, fallback);
}

/**
 * Importacao de processos em andamento por planilha (docs/product/flow-process-import-sprints.md):
 * planilha -> conferencia -> importacao. Cada linha pronta vira cliente (ou usa o cadastrado pelo CPF),
 * card com o numero CNJ na primeira coluna do board escolhido e consulta diaria no DataJud.
 */
export default function ProcessImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<ProcessImportOptionsDto | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [boardId, setBoardId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<ImportRowPayload[]>([]);
  const [preview, setPreview] = useState<ProcessImportPreviewRowDto[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<ProcessImportStatusDto | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [queued, setQueued] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kanbanApi.processImports
      .options()
      .then((loaded) => {
        setOptions(loaded);
        setBoardId(loaded.boards[0]?.id ?? "");
        setOfficeId(loaded.offices.length === 1 ? loaded.offices[0].id : "");
      })
      .catch((err) => setError(errorMessage(err, "Erro ao carregar boards e escritórios")));
  }, []);

  const missingFields = mapping ? REQUIRED_FIELDS.filter((field) => mapping[field] === null) : REQUIRED_FIELDS;
  const canReview = Boolean(boardId && officeId && sheet && mapping && missingFields.length === 0 && rows.length > 0 && rows.length <= MAX_IMPORT_ROWS);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".xlsx") && file.type !== XLSX_MIME) {
      setError("Envie a planilha em .xlsx.");
      return;
    }
    setBusy(true);
    try {
      const parsed = await readSpreadsheet(file);
      const detected = detectColumns(parsed.headers);
      setFileName(file.name);
      setSheet(parsed);
      setMapping(detected);
      setRows(buildRows(parsed, detected));
    } catch {
      setError("Não foi possível ler a planilha. Confira se é um .xlsx válido.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function changeMapping(field: ImportField, value: string) {
    if (!sheet || !mapping) return;
    const next = { ...mapping, [field]: value === "" ? null : Number(value) };
    setMapping(next);
    setRows(buildRows(sheet, next));
  }

  async function handleReview() {
    if (!canReview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await kanbanApi.processImports.preview({ boardId, officeId, rows });
      setPreview(result.rows);
      setFilter("all");
      setStep("review");
    } catch (err) {
      setError(errorMessage(err, "Erro ao conferir a planilha"));
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => ({
    ready: preview.filter((row) => row.status === "ready").length,
    invalid: preview.filter((row) => row.status === "invalid").length,
    existing: preview.filter((row) => row.status === "existing").length,
  }), [preview]);

  async function handleImport() {
    if (counts.ready === 0) return;
    setBusy(true);
    setError(null);
    try {
      const created = await kanbanApi.processImports.create({ boardId, officeId, rows });
      setImportId(created.importId);
      setQueued(created.queued);
      setStep("result");
    } catch (err) {
      setError(errorMessage(err, "Erro ao iniciar a importação"));
    } finally {
      setBusy(false);
    }
  }

  const loadStatus = useCallback(async (id: string) => {
    try {
      setStatus(await kanbanApi.processImports.status(id));
    } catch (err) {
      setError(errorMessage(err, "Erro ao consultar a importação"));
    }
  }, []);

  // Consulta o andamento a cada 2,5 s enquanto o lote nao termina.
  const lotStatus = status?.status;
  useEffect(() => {
    if (!importId) return;
    if (lotStatus === "completed" || lotStatus === "failed") return;
    if (!lotStatus) void loadStatus(importId);
    const timer = setTimeout(() => void loadStatus(importId), 2500);
    return () => clearTimeout(timer);
  }, [importId, lotStatus, status, loadStatus]);

  async function handleResume() {
    if (!importId) return;
    setBusy(true);
    try {
      setQueued((await kanbanApi.processImports.resume(importId)).queued);
      await loadStatus(importId);
    } catch (err) {
      setError(errorMessage(err, "Erro ao retomar a importação"));
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStep("upload");
    setSheet(null);
    setMapping(null);
    setRows([]);
    setPreview([]);
    setFileName(null);
    setImportId(null);
    setStatus(null);
    setError(null);
  }

  const visiblePreview = filter === "all" ? preview : preview.filter((row) => row.status === filter);
  const processed = status ? status.rows.filter((row) => row.status !== "pending").length : 0;
  const running = status?.status === "pending" || status?.status === "processing";

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">Importar processos</h4>
          <p className="text-muted mb-0">
            Processos já protocolados, de uma planilha .xlsx com nome, CPF e número do processo (CNJ). Cada linha vira um card com consulta diária no DataJud.
          </p>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3" aria-label="Etapas da importação">
        {STEPS.map((item) => (
          <Badge key={item.id} color={item.id === step ? "primary" : "light"} className={item.id === step ? "" : "text-muted"} pill>
            <i className={`${item.icon} me-1`} />
            {item.label}
          </Badge>
        ))}
      </div>

      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      {options && !options.monitoringEnabled && (
        <Alert color="warning">Importar processos exige o Monitoramento processual contratado, que faz o acompanhamento no DataJud. Peça ao administrador.</Alert>
      )}

      {step === "upload" && (
        <Card>
          <CardBody>
            {!options ? (
              <div className="text-muted"><Spinner size="sm" className="me-1" />Carregando…</div>
            ) : (
              <>
                <Row className="g-3">
                  <Col md={6}>
                    <FormGroup>
                      <Label for="import-board">Board de destino</Label>
                      {options.boards.length === 0 ? (
                        <Alert color="warning" className="small mb-0">Você não participa de nenhum board com coluna padrão.</Alert>
                      ) : (
                        <Input id="import-board" type="select" value={boardId} onChange={(event) => setBoardId(event.target.value)}>
                          {options.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                        </Input>
                      )}
                    </FormGroup>
                  </Col>
                  <Col md={6}>
                    <FormGroup>
                      <Label for="import-office">Escritório</Label>
                      {options.offices.length === 0 ? (
                        <Alert color="warning" className="small mb-0">Você não tem escritório ativo no Flow.</Alert>
                      ) : (
                        <Input id="import-office" type="select" value={officeId} onChange={(event) => setOfficeId(event.target.value)}>
                          {options.offices.length > 1 && <option value="">Selecione o escritório</option>}
                          {options.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                        </Input>
                      )}
                      <div className="form-text">Os responsáveis do escritório viram responsáveis dos cards.</div>
                    </FormGroup>
                  </Col>
                </Row>

                <FormGroup className="mt-2">
                  <Label for="import-file">Planilha (.xlsx, até {MAX_IMPORT_ROWS} linhas)</Label>
                  <Input id="import-file" innerRef={fileRef} type="file" accept=".xlsx" disabled={busy} onChange={(event) => void handleFile(event.target.files?.[0])} />
                  <div className="form-text">A planilha é lida neste navegador; o arquivo não é enviado nem guardado.</div>
                </FormGroup>

                {sheet && mapping && (
                  <div className="mt-3">
                    <div className="fw-semibold mb-2">
                      <i className="ri-file-excel-2-line me-1" />
                      {fileName} · {rows.length} {rows.length === 1 ? "linha" : "linhas"}
                    </div>
                    {rows.length > MAX_IMPORT_ROWS && <Alert color="danger" className="small">A planilha passa de {MAX_IMPORT_ROWS} linhas. Divida em arquivos menores.</Alert>}
                    <Row className="g-2">
                      {(Object.keys(FIELD_LABEL) as ImportField[]).map((field) => (
                        <Col md={4} key={field}>
                          <Label for={`map-${field}`} className="small mb-1">{FIELD_LABEL[field]}</Label>
                          <Input id={`map-${field}`} type="select" bsSize="sm" value={mapping[field] ?? ""} invalid={REQUIRED_FIELDS.includes(field) && mapping[field] === null}
                            onChange={(event) => changeMapping(field, event.target.value)}>
                            <option value="">{REQUIRED_FIELDS.includes(field) ? "Escolha a coluna" : "Não usar"}</option>
                            {sheet.headers.map((header, index) => <option key={index} value={index}>{header || `Coluna ${index + 1}`}</option>)}
                          </Input>
                        </Col>
                      ))}
                    </Row>
                    {missingFields.length > 0 && (
                      <div className="small text-danger mt-2">Indique a coluna de: {missingFields.map((field) => FIELD_LABEL[field]).join(", ")}.</div>
                    )}
                  </div>
                )}

                <div className="d-flex justify-content-end mt-3">
                  <Button color="primary" disabled={!canReview || busy || !options.monitoringEnabled} onClick={() => void handleReview()}>
                    {busy ? <Spinner size="sm" className="me-1" /> : <i className="ri-list-check-2 me-1" />}
                    Conferir linhas
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardBody>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {([["all", `Todas (${preview.length})`], ["ready", `Prontas (${counts.ready})`], ["invalid", `Com erro (${counts.invalid})`], ["existing", `Já existem (${counts.existing})`]] as Array<[Filter, string]>).map(([id, label]) => (
                <Button key={id} size="sm" color={filter === id ? "primary" : "light"} onClick={() => setFilter(id)}>{label}</Button>
              ))}
            </div>
            <div className="table-responsive" style={{ maxHeight: 480 }}>
              <Table size="sm" className="align-middle mb-0">
                <thead className="table-light">
                  <tr><th>Linha</th><th>Situação</th><th>Processo</th><th>Cliente</th><th>Observações</th></tr>
                </thead>
                <tbody>
                  {visiblePreview.map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td><Badge className={`bg-${PREVIEW_BADGE[row.status].color}-subtle text-${PREVIEW_BADGE[row.status].color}`}>{PREVIEW_BADGE[row.status].label}</Badge></td>
                      <td className="text-nowrap">{row.processNumber ?? "-"}{row.tribunal && <span className="text-muted"> · {row.tribunal}</span>}</td>
                      <td className="small">{row.customer ? CUSTOMER_LABEL[row.customer] : "-"}</td>
                      <td className="small">
                        {row.problems.map((problem) => <div key={problem} className="text-danger">{PROBLEM_LABEL[problem] ?? problem}</div>)}
                        {row.warnings.map((warning) => <div key={warning} className="text-warning">{WARNING_LABEL[warning] ?? warning}</div>)}
                        {row.existingCardUrl && <a href={row.existingCardUrl}>Abrir card existente</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <p className="text-muted small mt-3 mb-0">
              Só as linhas prontas são importadas. Cliente já cadastrado é mantido como está. A situação (STATUS) entra como primeiro comentário do card.
              A primeira consulta no DataJud só registra o estado atual, sem listar movimentações antigas.
            </p>
            <div className="d-flex justify-content-between mt-3">
              <Button color="light" disabled={busy} onClick={() => setStep("upload")}><i className="ri-arrow-left-line me-1" />Voltar</Button>
              <Button color="primary" disabled={busy || counts.ready === 0} onClick={() => void handleImport()}>
                {busy ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-cloud-2-line me-1" />}
                Importar {counts.ready} {counts.ready === 1 ? "linha" : "linhas"}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "result" && (
        <Card>
          <CardBody>
            {!status ? (
              <div className="text-muted"><Spinner size="sm" className="me-1" />Iniciando…</div>
            ) : (
              <>
                <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
                  {running && <Spinner size="sm" />}
                  <div className="fw-semibold">
                    {running ? `Importando: ${processed} de ${status.totalRows}` : status.status === "completed" ? "Importação concluída" : "Importação interrompida"}
                  </div>
                  <Badge className="bg-success-subtle text-success">{status.createdCount || status.rows.filter((r) => r.status === "created").length} criados</Badge>
                  <Badge className="bg-warning-subtle text-warning">{status.existingCount || status.rows.filter((r) => r.status === "existing").length} já existiam</Badge>
                  <Badge className="bg-danger-subtle text-danger">{status.failedCount || status.rows.filter((r) => r.status === "failed").length} falharam</Badge>
                </div>
                {status.failureCode && <Alert color="danger" className="small">{LOT_FAILURE_LABEL[status.failureCode] ?? status.failureCode}</Alert>}
                {!queued && status.status === "pending" && (
                  <Alert color="warning" className="small">A fila de processamento não respondeu. Use "Retomar".</Alert>
                )}
                <div className="table-responsive" style={{ maxHeight: 480 }}>
                  <Table size="sm" className="align-middle mb-0">
                    <thead className="table-light"><tr><th>Linha</th><th>Processo</th><th>Resultado</th><th></th></tr></thead>
                    <tbody>
                      {status.rows.map((row) => (
                        <tr key={row.line}>
                          <td>{row.line}</td>
                          <td className="text-nowrap">{row.processNumber}</td>
                          <td>
                            <Badge className={`bg-${RESULT_BADGE[row.status].color}-subtle text-${RESULT_BADGE[row.status].color}`}>{RESULT_BADGE[row.status].label}</Badge>
                            {row.errorCode && <span className="small text-danger ms-2">{ROW_ERROR_LABEL[row.errorCode] ?? row.errorCode}</span>}
                            {row.skippedAssignees > 0 && (
                              <span className="small text-muted ms-2">{row.skippedAssignees} responsável(is) do escritório fora do board</span>
                            )}
                          </td>
                          <td className="text-end small">
                            {row.cardUrl && <a href={row.cardUrl}>Abrir card</a>}
                            {row.existingCardUrl && <a href={row.existingCardUrl}>Abrir card existente</a>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="d-flex justify-content-between mt-3">
                  <Button color="light" disabled={running} onClick={restart}><i className="ri-file-excel-2-line me-1" />Nova importação</Button>
                  {status.status !== "completed" && status.status !== "processing" && (
                    <Button color="primary" disabled={busy} onClick={() => void handleResume()}>
                      {busy ? <Spinner size="sm" className="me-1" /> : <i className="ri-restart-line me-1" />}
                      Retomar
                    </Button>
                  )}
                  {status.status === "completed" && status.failedCount > 0 && (
                    <span className="small text-muted align-self-center">Linhas que falharam: corrija na planilha e importe de novo; as já criadas não se repetem.</span>
                  )}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
