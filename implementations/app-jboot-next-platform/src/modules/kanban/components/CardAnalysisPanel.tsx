"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Spinner } from "reactstrap";
import {
  DocumentFormat,
  GeneratedDocumentDto,
  kanbanApi,
  LeadAnalysisDto,
  LeadCaseDto,
  TemplateWarningDto,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import {
  availableCaseTypes,
  currentDocument,
  defaultTemplateId,
  describeEditedWarning,
  describePdfError,
  DOCUMENT_STATUS_META,
  formatBytesShort,
  pdfBadge,
  TEMPLATE_UNUSABLE_LABELS,
  templatesForCase,
} from "@/modules/kanban/lib/lead-analysis";
import { formatLeadDate } from "@/modules/kanban/lib/leads";
import LeadCaseReasonModal from "@/modules/kanban/components/LeadCaseReasonModal";
import LeadDocumentUploadModal from "@/modules/kanban/components/LeadDocumentUploadModal";
import LeadStatusBadge from "@/modules/kanban/components/LeadStatusBadge";
import { openSignedDownload } from "@/modules/kanban/components/CardLeadDocumentsPanel";

interface CardAnalysisPanelProps {
  boardId: string;
  cardId: string;
  reloadKey?: number;
  /** Qualquer mudanca da analise: o modal recarrega o painel do envio, o historico e o quadro. */
  onChanged?: (analysis: LeadAnalysisDto) => void;
}

type ReasonTarget = { mode: "change" | "remove"; leadCase: LeadCaseDto } | null;
type UploadTarget = { document: GeneratedDocumentDto; label: string } | null;

/**
 * Analise do lead pelo gestor (`flow:admin`, Sprint 6): classificar em um ou
 * mais casos (P3), gerar o rascunho a partir do modelo (padrao do tipo,
 * trocavel), baixar, aprovar ou substituir por versao editada, acompanhar o
 * PDF do aprovado ("Gerar PDF novamente") e ver versoes anteriores e casos
 * trocados. Toda regra e do backend; botoes seguem o estado devolvido.
 */
export default function CardAnalysisPanel({ boardId, cardId, reloadKey = 0, onChanged }: CardAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<LeadAnalysisDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<TemplateWarningDto[]>([]);
  const [newCaseTypeId, setNewCaseTypeId] = useState("");
  const [templateByCase, setTemplateByCase] = useState<Record<string, string>>({});
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [removedOpen, setRemovedOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setAnalysis(await kanbanApi.leadAnalysis.get(boardId, cardId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar a análise do lead"));
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function run(key: string, action: () => Promise<LeadAnalysisDto>, message: string) {
    setBusy(key);
    setError(null);
    setSuccess(null);
    setWarnings([]);
    try {
      const next = await action();
      setAnalysis(next);
      setSuccess(message);
      onChanged?.(next);
    } catch (err) {
      setError(describeKanbanError(err, "Erro na análise do lead"));
    } finally {
      setBusy(null);
    }
  }

  async function download(document: GeneratedDocumentDto, format: DocumentFormat) {
    setBusy(`${document.id}-${format}`);
    setError(null);
    try {
      const link = await kanbanApi.leadAnalysis.download(boardId, cardId, document.id, format);
      openSignedDownload(link.url, link.fileName);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao gerar link de download"));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-2">
        <Spinner size="sm" color="primary" />
      </div>
    );
  }
  if (!analysis) {
    return error ? (
      <Alert color="danger" className="small">
        {error}
      </Alert>
    ) : null;
  }
  if (!analysis.submissionId) {
    return null;
  }

  const open = analysis.analysisOpen;
  const addable = availableCaseTypes(analysis.caseTypes, analysis.cases);

  function renderDocument(leadCase: LeadCaseDto, document: GeneratedDocumentDto, isCurrent: boolean) {
    const status = DOCUMENT_STATUS_META[document.status];
    const pdf = pdfBadge(document.pdf);
    const label = `${document.templateName} v${document.version}`;
    return (
      <li key={document.id} className={`py-2 ${isCurrent ? "" : "text-muted"}`}>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className={`badge ${status.className}`}>{status.label}</span>
          <strong className="small">{label}</strong>
          <span className="small text-muted">
            {document.origin === "uploaded_edit" ? "versão editada pelo gestor" : `modelo v${document.templateVersion}`} ·{" "}
            {formatBytesShort(document.sizeBytes)} · {formatLeadDate(document.createdAt)}
            {document.createdByName ? ` por ${document.createdByName}` : ""}
          </span>
          {pdf && <span className={`badge ${pdf.className}`}>{pdf.label}</span>}
        </div>
        {document.approvedAt && (
          <div className="small text-muted">
            Aprovado em {formatLeadDate(document.approvedAt)}
            {document.approvedByName ? ` por ${document.approvedByName}` : ""}
          </div>
        )}
        {isCurrent && document.missingOptional.length > 0 && (
          <div className="small text-warning">
            <i className="ri-error-warning-line me-1" />
            Campos opcionais sem valor saíram como [PREENCHER]:{" "}
            {document.variables
              .filter((variable) => document.missingOptional.includes(variable.key))
              .map((variable) => variable.label)
              .join(", ")}
          </div>
        )}
        {document.pdf?.status === "failed" && (
          <div className="small text-danger">
            PDF não gerado após {document.pdf.attempts} tentativa(s): {describePdfError(document.pdf.errorCode)}. O .docx aprovado
            continua disponível.
          </div>
        )}
        <div className="d-flex flex-wrap gap-1 mt-1">
          <Button color="light" size="sm" disabled={busy !== null} onClick={() => void download(document, "docx")}>
            <i className="ri-file-word-line me-1" />
            Baixar .docx
          </Button>
          {document.pdf?.status === "done" && (
            <Button color="light" size="sm" disabled={busy !== null} onClick={() => void download(document, "pdf")}>
              <i className="ri-file-pdf-line me-1" />
              Baixar PDF
            </Button>
          )}
          {document.status === "aprovado" && document.pdf?.status === "failed" && (
            <Button
              color="danger"
              outline
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void run(`${document.id}-pdf-retry`, () => kanbanApi.leadAnalysis.retryPdf(boardId, cardId, document.id), "PDF reenfileirado.")
              }
            >
              <i className="ri-refresh-line me-1" />
              Gerar PDF novamente
            </Button>
          )}
          {isCurrent && open && document.status === "rascunho" && (
            <Button
              color="success"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  `${document.id}-approve`,
                  () => kanbanApi.leadAnalysis.approve(boardId, cardId, document.id),
                  "Documento aprovado. O escritório foi notificado e o PDF está sendo gerado."
                )
              }
            >
              {busy === `${document.id}-approve` ? <Spinner size="sm" className="me-1" /> : <i className="ri-check-line me-1" />}
              Aprovar
            </Button>
          )}
          {isCurrent && open && document.status !== "substituido" && (
            <Button color="light" size="sm" disabled={busy !== null} onClick={() => setUploadTarget({ document, label })}>
              <i className="ri-file-upload-line me-1" />
              Substituir por versão editada
            </Button>
          )}
        </div>
      </li>
    );
  }

  function renderCase(leadCase: LeadCaseDto) {
    const templates = templatesForCase(analysis!.caseTypes, leadCase.caseTypeId);
    const selected = templateByCase[leadCase.id] ?? defaultTemplateId(templates) ?? "";
    const current = currentDocument(leadCase);
    const older = leadCase.documents.filter((document) => document.id !== current?.id);
    return (
      <div key={leadCase.id} className="border rounded p-2 mb-2">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <span className="badge bg-primary-subtle text-primary me-1">
              <i className="ri-scales-3-line me-1" />
              {leadCase.caseTypeName}
            </span>
            {!leadCase.caseTypeActive && <span className="badge bg-secondary-subtle text-secondary me-1">tipo inativo</span>}
            <span className="small text-muted">
              {formatLeadDate(leadCase.decidedAt)}
              {leadCase.decidedByName ? ` por ${leadCase.decidedByName}` : ""}
            </span>
          </div>
          {open && (
            <div className="d-flex gap-1">
              <Button color="link" size="sm" className="p-0" disabled={busy !== null} onClick={() => setReasonTarget({ mode: "change", leadCase })}>
                Trocar tipo
              </Button>
              <Button
                color="link"
                size="sm"
                className="p-0 text-danger"
                disabled={busy !== null}
                onClick={() => setReasonTarget({ mode: "remove", leadCase })}
              >
                Remover
              </Button>
            </div>
          )}
        </div>

        {open && (
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <Input
              type="select"
              bsSize="sm"
              className="w-auto"
              value={selected}
              disabled={busy !== null || templates.length === 0}
              onChange={(event) => setTemplateByCase((map) => ({ ...map, [leadCase.id]: event.target.value }))}
              aria-label="Modelo do documento"
            >
              {templates.length === 0 && <option value="">Tipo de caso sem modelo vinculado</option>}
              {templates.map((template) => (
                <option key={template.id} value={template.id} disabled={!template.usable}>
                  {template.name}
                  {template.isDefault ? " (padrão)" : ""}
                  {template.unusableReason ? ` - ${TEMPLATE_UNUSABLE_LABELS[template.unusableReason]}` : ""}
                </option>
              ))}
            </Input>
            <Button
              color="primary"
              size="sm"
              disabled={busy !== null || !selected}
              onClick={() =>
                void run(
                  `${leadCase.id}-generate`,
                  () => kanbanApi.leadAnalysis.generate(boardId, cardId, leadCase.id, selected),
                  "Rascunho gerado. Baixe, revise e aprove ou substitua pela versão editada."
                )
              }
            >
              {busy === `${leadCase.id}-generate` ? <Spinner size="sm" className="me-1" /> : <i className="ri-file-add-line me-1" />}
              {current ? "Gerar nova versão" : "Gerar documento"}
            </Button>
          </div>
        )}

        {current ? (
          <ul className="list-unstyled mb-0 mt-1">{renderDocument(leadCase, current, true)}</ul>
        ) : (
          <div className="small text-muted mt-2">Nenhum documento gerado para este caso.</div>
        )}
        {older.length > 0 && (
          <>
            <Button
              color="link"
              size="sm"
              className="px-0"
              onClick={() => setExpanded((map) => ({ ...map, [leadCase.id]: !map[leadCase.id] }))}
            >
              <i className={`${expanded[leadCase.id] ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} me-1`} />
              Versões anteriores ({older.length})
            </Button>
            {expanded[leadCase.id] && (
              <ul className="list-unstyled mb-0 border-start border-2 ps-2">
                {older.map((document) => renderDocument(leadCase, document, false))}
              </ul>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 pb-3 border-bottom">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="text-muted mb-0">
          <i className="ri-search-eye-line me-1" />
          Análise (gestor)
        </h6>
        <LeadStatusBadge status={analysis.leadStatus} showDraft />
      </div>
      <p className="small text-muted mb-2">
        Classificação, rascunhos e histórico de geração só o gestor vê. O escritório recebe o documento aprovado (.docx e PDF).
      </p>

      {error && (
        <Alert color="danger" className="small" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="success" className="small" toggle={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert color="warning" className="small" toggle={() => setWarnings([])}>
          Versão editada aprovada com avisos:
          <ul className="mb-0 ps-3">
            {warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{describeEditedWarning(warning)}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!open && (
        <Alert color="secondary" className="small">
          <i className="ri-lock-line me-1" />
          Análise fechada: o lead não está aguardando o gestor (estado atual acima).
        </Alert>
      )}

      {analysis.cases.length === 0 && open && <div className="small text-muted mb-2">Escolha o tipo de caso do lead.</div>}
      {analysis.cases.map(renderCase)}

      {open && (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Input
            type="select"
            bsSize="sm"
            className="w-auto"
            value={newCaseTypeId}
            disabled={busy !== null || addable.length === 0}
            onChange={(event) => setNewCaseTypeId(event.target.value)}
            aria-label="Tipo de caso"
          >
            <option value="">
              {analysis.caseTypes.length === 0
                ? "Nenhum tipo de caso ativo (cadastre em Leads > Tipos de caso)"
                : addable.length === 0
                  ? "Todos os tipos já classificados"
                  : "Tipo de caso"}
            </option>
            {addable.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Input>
          <Button
            color="primary"
            outline
            size="sm"
            disabled={busy !== null || !newCaseTypeId}
            onClick={() =>
              void run(
                "add-case",
                async () => {
                  const next = await kanbanApi.leadAnalysis.addCase(boardId, cardId, newCaseTypeId);
                  setNewCaseTypeId("");
                  return next;
                },
                "Caso adicionado."
              )
            }
          >
            <i className="ri-add-line me-1" />
            {analysis.cases.length === 0 ? "Classificar" : "Adicionar caso"}
          </Button>
        </div>
      )}

      {analysis.removedCases.length > 0 && (
        <>
          <Button color="link" size="sm" className="px-0 mt-1" onClick={() => setRemovedOpen((value) => !value)}>
            <i className={`${removedOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} me-1`} />
            Casos trocados ou removidos ({analysis.removedCases.length})
          </Button>
          {removedOpen && (
            <ul className="list-unstyled small mb-0 border-start border-2 ps-2">
              {analysis.removedCases.map((leadCase) => (
                <li key={leadCase.id} className="mb-1 text-muted">
                  {leadCase.caseTypeName} · {leadCase.replacesCaseId ? "troca" : "classificado"} em {formatLeadDate(leadCase.decidedAt)}; saiu
                  em {formatLeadDate(leadCase.supersededAt)}
                  {leadCase.supersededByName ? ` por ${leadCase.supersededByName}` : ""}: {leadCase.supersededReason}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {reasonTarget && (
        <LeadCaseReasonModal
          isOpen
          mode={reasonTarget.mode}
          caseTypeName={reasonTarget.leadCase.caseTypeName}
          options={availableCaseTypes(analysis.caseTypes, analysis.cases)}
          onClose={() => setReasonTarget(null)}
          onConfirm={async (reason, caseTypeId) => {
            const target = reasonTarget;
            const next =
              target.mode === "change" && caseTypeId
                ? await kanbanApi.leadAnalysis.changeCase(boardId, cardId, target.leadCase.id, caseTypeId, reason)
                : await kanbanApi.leadAnalysis.removeCase(boardId, cardId, target.leadCase.id, reason);
            setAnalysis(next);
            setSuccess(target.mode === "change" ? "Tipo de caso trocado." : "Caso removido.");
            onChanged?.(next);
          }}
        />
      )}
      {uploadTarget && (
        <LeadDocumentUploadModal
          isOpen
          boardId={boardId}
          cardId={cardId}
          documentId={uploadTarget.document.id}
          documentLabel={uploadTarget.label}
          onClose={() => setUploadTarget(null)}
          onUploaded={(result) => {
            setAnalysis(result.analysis);
            setWarnings(result.warnings);
            setSuccess("Versão editada aprovada. O escritório foi notificado e o PDF está sendo gerado.");
            onChanged?.(result.analysis);
          }}
        />
      )}
    </div>
  );
}
