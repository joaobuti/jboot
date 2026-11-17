"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "reactstrap";
import { DocumentFormat, kanbanApi, LeadDeliveredDocumentsDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { formatLeadDate } from "@/modules/kanban/lib/leads";

interface CardLeadDocumentsPanelProps {
  boardId: string;
  cardId: string;
  reloadKey?: number;
}

/** Abre a URL assinada (5 min) num link temporario, como o download de anexos. */
export function openSignedDownload(url: string, fileName: string): void {
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

/**
 * Documentos ENTREGUES ao escritorio (Sprint 6, P11): so o documento aprovado
 * de cada caso, em .docx e PDF. Sem classificacao, rascunhos ou historico de
 * geracao (o backend nao os devolve). Sem documento aprovado, nada aparece.
 */
export default function CardLeadDocumentsPanel({ boardId, cardId, reloadKey = 0 }: CardLeadDocumentsPanelProps) {
  const [data, setData] = useState<LeadDeliveredDocumentsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await kanbanApi.leads.documents(boardId, cardId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar os documentos do lead"));
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function handleDownload(documentId: string, format: DocumentFormat) {
    setBusy(`${documentId}-${format}`);
    setError(null);
    try {
      const link = await kanbanApi.leads.downloadDocument(boardId, cardId, documentId, format);
      openSignedDownload(link.url, link.fileName);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao gerar link de download"));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return null;
  }
  if (!data || data.documents.length === 0) {
    return error ? (
      <Alert color="danger" className="small">
        {error}
      </Alert>
    ) : null;
  }

  return (
    <div className="mb-3 pb-3 border-bottom">
      <h6 className="text-muted mb-2">
        <i className="ri-file-text-line me-1" />
        Documentos aprovados
      </h6>
      {error && (
        <Alert color="danger" className="small" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      <ul className="list-unstyled mb-0">
        {data.documents.map((document) => (
          <li key={document.id} className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-1">
            <div className="small">
              <strong>{document.title}</strong> <span className="text-muted">v{document.version}</span>
              <div className="text-muted">Aprovado em {formatLeadDate(document.approvedAt)}</div>
            </div>
            <div className="d-flex gap-1">
              <Button
                color="light"
                size="sm"
                disabled={busy !== null}
                onClick={() => void handleDownload(document.id, "docx")}
              >
                {busy === `${document.id}-docx` ? <Spinner size="sm" /> : <i className="ri-file-word-line me-1" />}
                .docx
              </Button>
              {document.pdfStatus === "ready" ? (
                <Button color="light" size="sm" disabled={busy !== null} onClick={() => void handleDownload(document.id, "pdf")}>
                  {busy === `${document.id}-pdf` ? <Spinner size="sm" /> : <i className="ri-file-pdf-line me-1" />}
                  PDF
                </Button>
              ) : (
                <span className="badge bg-info-subtle text-info align-self-center" title="O PDF fica disponível em instantes">
                  PDF em preparação
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
