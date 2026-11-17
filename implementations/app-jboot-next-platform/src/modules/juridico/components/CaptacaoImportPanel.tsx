"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Spinner } from "reactstrap";
import {
  juridicoApi,
  CaptacaoCpfDto,
  ConsultationStatus,
  ImportResultDto,
} from "@/modules/juridico/lib/juridico-api";

const ACCEPTED_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const STATUS_BADGE: Record<ConsultationStatus, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-secondary-subtle text-secondary" },
  done: { label: "Consultado", className: "bg-success-subtle text-success" },
  error: { label: "Erro", className: "bg-danger-subtle text-danger" },
};

const UF_OPTIONS = [{ value: "SC", label: "SC - Santa Catarina" }];

async function parseCpfsFromFile(file: File): Promise<{ cpf: string; nome: string }[]> {
  const { read, utils } = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = utils.sheet_to_json(sheet, { header: 1 });

  const seen = new Set<string>();
  const entries: { cpf: string; nome: string }[] = [];
  // skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const nome = String(row?.[0] ?? "").trim();
    const cpf = String(row?.[1] ?? "").replace(/\D/g, "");
    if (cpf.length === 11 && !seen.has(cpf)) {
      seen.add(cpf);
      entries.push({ cpf, nome });
    }
  }
  return entries;
}

export default function CaptacaoImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<{ cpf: string; nome: string }[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedUf, setSelectedUf] = useState("SC");

  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResultDto | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [cpfs, setCpfs] = useState<CaptacaoCpfDto[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const loadList = useCallback(async (currentOffset: number) => {
    try {
      setListLoading(true);
      const page = await juridicoApi.captacao.list(LIMIT, currentOffset);
      setCpfs(page.data);
      setTotal(page.meta.total);
      setOffset(currentOffset);
    } catch {
      // list load failure is non-blocking
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(0);
  }, [loadList]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    const isAccepted =
      ACCEPTED_TYPES.includes(file.type) || /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!isAccepted) {
      setFileError("Formato inválido. Use .xlsx, .xls ou .csv");
      e.target.value = "";
      return;
    }

    setFileError(null);
    setImportResult(null);
    setImportError(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const found = await parseCpfsFromFile(file);
      if (found.length === 0) {
        setFileError("Nenhum CPF válido encontrado. Verifique se col. A = Nome e col. B = CPF.");
        setFileName(null);
      } else {
        setPreview(found);
      }
    } catch {
      setFileError("Não foi possível ler o arquivo.");
      setFileName(null);
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  async function handleImport() {
    if (preview.length === 0 || !selectedUf) return;
    setSubmitting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await juridicoApi.captacao.import(preview, selectedUf, fileName ?? undefined);
      setImportResult(result);
      setPreview([]);
      setFileName(null);
      await loadList(0);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erro ao importar CPFs");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport(format: "excel" | "pdf") {
    setExporting(format);
    setExportError(null);
    try {
      const file = format === "excel"
        ? await juridicoApi.captacao.exportExcel()
        : await juridicoApi.captacao.exportPdf();
      const url = window.URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Erro ao exportar arquivo");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      {/* Import panel */}
      <div className="card">
        <div className="card-body">
          <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
            <div>
              <h5 className="card-title mb-1">Importar lista de CPFs</h5>
              <p className="text-muted mb-0 small">
                Arquivo .xlsx, .xls ou .csv — col. A: Nome, col. B: CPF.
              </p>
            </div>
            <div style={{ minWidth: 220 }}>
              <label className="form-label small text-muted" htmlFor="captacao-uf">
                UF da planilha
              </label>
              <Input
                id="captacao-uf"
                type="select"
                value={selectedUf}
                onChange={(event) => setSelectedUf(event.target.value)}
                disabled={parsing || submitting}
              >
                {UF_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Input>
            </div>
            <input
              ref={inputRef}
              type="file"
              className="d-none"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void handleFileChange(e)}
            />
            <Button
              color="primary"
              onClick={() => inputRef.current?.click()}
              disabled={parsing || submitting}
            >
              {parsing ? (
                <Spinner size="sm" className="me-1" />
              ) : (
                <i className="ri-upload-2-line align-bottom me-1" />
              )}
              Selecionar arquivo
            </Button>
          </div>

          {fileError && (
            <Alert color="danger" className="mt-3 mb-0 py-2">
              <i className="ri-error-warning-line me-2" />
              {fileError}
            </Alert>
          )}

          {importResult && (
            <Alert color="success" className="mt-3 mb-0 py-2">
              <i className="ri-checkbox-circle-line me-2" />
              <strong>{importResult.imported}</strong> CPFs importados
              {" "}para <strong>{importResult.uf}</strong>
              {importResult.skipped > 0 && (
                <>, <strong>{importResult.skipped}</strong> ignorados (já existiam)</>
              )}
            </Alert>
          )}

          {importError && (
            <Alert color="danger" className="mt-3 mb-0 py-2">
              <i className="ri-error-warning-line me-2" />
              {importError}
            </Alert>
          )}

          {preview.length > 0 && (
            <div className="mt-3 p-3 bg-light rounded">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-muted small">
                  <strong>{preview.length}</strong> CPFs encontrados em{" "}
                  <strong>{fileName}</strong> para <strong>{selectedUf}</strong>
                </span>
                <div className="d-flex gap-2">
                  <Button
                    color="success"
                    size="sm"
                    onClick={() => void handleImport()}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Spinner size="sm" className="me-1" />
                    ) : (
                      <i className="ri-check-line me-1" />
                    )}
                    Confirmar importação
                  </Button>
                  <Button
                    color="outline-secondary"
                    size="sm"
                    onClick={() => { setPreview([]); setFileName(null); }}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
              <div className="d-flex flex-wrap gap-1">
                {preview.slice(0, 10).map((entry) => (
                  <span key={entry.cpf} className="badge bg-primary-subtle text-primary font-monospace">
                    {entry.nome ? `${entry.nome} — ` : ""}{entry.cpf}
                  </span>
                ))}
                {preview.length > 10 && (
                  <span className="badge bg-secondary-subtle text-secondary">
                    +{preview.length - 10} mais
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CPF list */}
      <div className="card">
        <div className="card-header d-flex align-items-center justify-content-between">
          <h5 className="card-title mb-0">
            CPFs cadastrados
            {total > 0 && <span className="badge bg-secondary-subtle text-secondary ms-2">{total}</span>}
          </h5>
          <div className="d-flex gap-2">
            <Button
              color="outline-secondary"
              size="sm"
              onClick={() => void handleExport("pdf")}
              disabled={exporting !== null}
            >
              {exporting === "pdf" ? (
                <Spinner size="sm" className="me-1" />
              ) : (
                <i className="ri-file-pdf-2-line me-1" />
              )}
              Exportar PDF
            </Button>
            <Button
              color="outline-secondary"
              size="sm"
              onClick={() => void handleExport("excel")}
              disabled={exporting !== null}
            >
              {exporting === "excel" ? (
                <Spinner size="sm" className="me-1" />
              ) : (
                <i className="ri-file-excel-2-line me-1" />
              )}
              Exportar Excel
            </Button>
          </div>
        </div>
        {exportError && (
          <Alert color="danger" className="m-3 mb-0 py-2">
            <i className="ri-error-warning-line me-2" />
            {exportError}
          </Alert>
        )}
        <div className="card-body p-0">
          {listLoading ? (
            <div className="text-center py-5">
              <Spinner color="primary" />
            </div>
          ) : cpfs.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="ri-file-list-3-line display-5 d-block mb-2" />
              Nenhum CPF importado ainda.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover table-nowrap align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th>Importado em</th>
                      <th>Portais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cpfs.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nome ?? <span className="text-muted">—</span>}</td>
                        <td className="font-monospace">{item.cpf}</td>
                        <td className="text-muted small">
                          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                        <td>
                          <div className="d-flex gap-1 flex-wrap">
                            {item.consultations.map((c) => {
                              const badge = STATUS_BADGE[c.status];
                              return (
                                <span
                                  key={c.portalSlug}
                                  className={`badge ${badge.className}`}
                                  title={c.errorMessage ?? c.portalName}
                                >
                                  {c.portalSlug.toUpperCase()} — {badge.label}
                                </span>
                              );
                            })}
                            {item.consultations.length === 0 && (
                              <span className="text-muted small">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > LIMIT && (
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-top">
                  <small className="text-muted">
                    {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
                  </small>
                  <div className="d-flex gap-2">
                    <Button
                      size="sm"
                      color="outline-secondary"
                      disabled={offset === 0 || listLoading}
                      onClick={() => void loadList(offset - LIMIT)}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      color="outline-secondary"
                      disabled={offset + LIMIT >= total || listLoading}
                      onClick={() => void loadList(offset + LIMIT)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
