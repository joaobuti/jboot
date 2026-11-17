"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "reactstrap";
import { CardLeadDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import {
  describeLeadMissing,
  formatLeadDate,
  leadFieldLabel,
  leadIncompleteFromError,
  LeadMissingSummary,
  shouldShowLeadPanel,
} from "@/modules/kanban/lib/leads";
import LeadReturnModal from "@/modules/kanban/components/LeadReturnModal";
import LeadStatusBadge from "@/modules/kanban/components/LeadStatusBadge";

interface CardLeadPanelProps {
  boardId: string;
  cardId: string;
  /** Recarrega quando o cliente ou os documentos do card mudam (o que falta muda junto). */
  reloadKey?: number;
  /** Estado carregado (o modal congela os campos do card quando `editable = false`). */
  onLoaded?: (lead: CardLeadDto) => void;
  /** Envio ou devolucao concluidos: o modal recarrega paineis, historico e quadro. */
  onTransition?: (lead: CardLeadDto) => void;
}

/**
 * Envio para analise no card (CRM de leads, Sprint 4). Mostra o estado do lead,
 * o que falta (cliente, campos e documentos, calculado pelo backend), o motivo
 * da devolucao e as acoes permitidas pelo backend (`canSubmit`/`canReturn`).
 */
export default function CardLeadPanel({ boardId, cardId, reloadKey = 0, onLoaded, onTransition }: CardLeadPanelProps) {
  const [lead, setLead] = useState<CardLeadDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<LeadMissingSummary | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Callback do pai em ref: recarregar nao depende da identidade da funcao.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await kanbanApi.leads.get(boardId, cardId);
      setLead(result);
      onLoadedRef.current?.(result);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar o estado do lead"));
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  function applyTransition(next: CardLeadDto, message: string) {
    setLead(next);
    setMissing(null);
    setSuccess(message);
    onLoadedRef.current?.(next);
    onTransition?.(next);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setMissing(null);
    setSuccess(null);
    try {
      applyTransition(await kanbanApi.leads.submit(boardId, cardId), "Lead enviado para análise. O gestor foi notificado.");
    } catch (err) {
      const incomplete = leadIncompleteFromError(err);
      if (incomplete) {
        setMissing(incomplete);
      } else {
        setError(describeKanbanError(err, "Erro ao enviar o lead"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-2">
        <Spinner size="sm" color="primary" />
      </div>
    );
  }
  if (!lead) {
    return error ? (
      <Alert color="danger" className="mb-0 small">
        {error}
      </Alert>
    ) : null;
  }
  if (!shouldShowLeadPanel(lead)) {
    return null;
  }

  const current = lead.currentSubmission;
  const readinessItems = lead.readiness ? describeLeadMissing(lead.readiness) : [];
  const missingItems = missing ? describeLeadMissing(missing) : [];
  const pastCycles = lead.history.filter((cycle) => cycle.id !== current?.id);

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="text-muted mb-0">
          <i className="ri-send-plane-line me-1" />
          Envio para análise
        </h6>
        <LeadStatusBadge status={lead.status} showDraft />
      </div>

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

      {lead.status === "devolvido" && current?.returnReason && (
        <Alert color="warning" className="small">
          <i className="ri-arrow-go-back-line me-1" />
          Devolvido{current.returnedByName ? ` por ${current.returnedByName}` : ""} em {formatLeadDate(current.returnedAt)}:{" "}
          <strong>{current.returnReason}</strong>
          <div className="mt-1">Corrija o que foi apontado e envie de novo.</div>
        </Alert>
      )}

      {!lead.editable && current && (
        <Alert color="info" className="small">
          <i className="ri-lock-line me-1" />
          Enviado em {formatLeadDate(current.submittedAt)}
          {current.submittedByName ? ` por ${current.submittedByName}` : ""}. Cadastro, cliente e documentos ficam bloqueados
          para edição até o gestor devolver o lead.
        </Alert>
      )}

      {lead.customerSnapshot?.outdated && (
        <Alert color="warning" className="small">
          <i className="ri-error-warning-line me-1" />
          {lead.customerSnapshot.customerChanged
            ? "O cliente vinculado mudou depois do envio."
            : `O cadastro do cliente foi alterado depois do envio (${lead.customerSnapshot.changedFields
                .map(leadFieldLabel)
                .join(", ")}).`}
        </Alert>
      )}

      {lead.editable && lead.leadIntakeEnabled && lead.readiness && (
        <div className="small mb-2">
          {lead.readiness.complete ? (
            <span className="text-success">
              <i className="ri-checkbox-circle-line me-1" />
              Cadastro e documentos obrigatórios completos.
            </span>
          ) : (
            <>
              <span className="text-muted">Para enviar, falta:</span>
              <ul className="mb-0 ps-3">
                {readinessItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {missingItems.length > 0 && (
        <Alert color="danger" className="small" toggle={() => setMissing(null)}>
          O lead ainda não pode ser enviado. Falta:
          <ul className="mb-0 ps-3">
            {missingItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2">
        {lead.editable && lead.leadIntakeEnabled && lead.canSubmit && (
          <Button
            color="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={submitting || !lead.readiness?.complete}
            title={lead.readiness?.complete ? undefined : "Complete os itens pendentes para enviar"}
          >
            {submitting ? <Spinner size="sm" className="me-1" /> : <i className="ri-send-plane-line me-1" />}
            {lead.status === "devolvido" ? "Reenviar para análise" : "Enviar para análise"}
          </Button>
        )}
        {lead.canReturn && (
          <Button color="warning" outline size="sm" onClick={() => setReturnOpen(true)}>
            <i className="ri-arrow-go-back-line me-1" />
            Devolver ao escritório
          </Button>
        )}
        {pastCycles.length > 0 && (
          <Button color="link" size="sm" className="px-0" onClick={() => setHistoryOpen((open) => !open)}>
            <i className={`${historyOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} me-1`} />
            Envios anteriores ({pastCycles.length})
          </Button>
        )}
      </div>

      {historyOpen && pastCycles.length > 0 && (
        <ul className="list-unstyled small mt-2 mb-0">
          {pastCycles.map((cycle) => (
            <li key={cycle.id} className="border-start border-2 ps-2 mb-2">
              Enviado em {formatLeadDate(cycle.submittedAt)}
              {cycle.submittedByName ? ` por ${cycle.submittedByName}` : ""}
              {cycle.returnedAt && (
                <div className="text-muted">
                  Devolvido em {formatLeadDate(cycle.returnedAt)}
                  {cycle.returnedByName ? ` por ${cycle.returnedByName}` : ""}: {cycle.returnReason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {lead.canReturn && (
        <LeadReturnModal
          isOpen={returnOpen}
          boardId={boardId}
          cardId={cardId}
          onClose={() => setReturnOpen(false)}
          onReturned={(next) => applyTransition(next, "Lead devolvido ao escritório.")}
        />
      )}
    </div>
  );
}
