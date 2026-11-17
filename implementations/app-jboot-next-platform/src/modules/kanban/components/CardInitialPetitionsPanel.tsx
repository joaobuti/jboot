"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Spinner } from "reactstrap";
import { getApplicationScopes } from "@/lib/module-auth-token";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { InitialPetitionDto, InitialPetitionsRunDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import {
  ALERT_LABEL,
  canSendCorrected,
  CLOSING_GAP_LABEL,
  COURT_LABEL,
  documentStatusLabel,
  PETITION_APPROVE_SCOPES,
  petitionCompletionText,
} from "@/modules/kanban/lib/initial-petitions";
import CorrectedPetitionModal from "./CorrectedPetitionModal";
import RegisterProcessNumberModal from "./RegisterProcessNumberModal";
import { canRegisterProcessNumber, formatCnjInput } from "@/modules/kanban/lib/petition-monitoring";
import { formatLeadDate } from "@/modules/kanban/lib/leads";

interface CardInitialPetitionsPanelProps {
  boardId: string;
  cardId: string;
  onChanged?: () => void;
  /** Muda quando chega aviso em tempo real do card. */
  reloadKey?: number;
}

const TONE_CLASS = { success: "text-success", muted: "text-muted", warning: "text-warning" } as const;

function ReportList({ title, items }: { title: string; items: React.ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="small fw-semibold mb-1">{title}</div>
      <ul className="small text-muted mb-0 ps-3">
        {items.map((item, index) => (
          <li key={index} className="text-break">{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Petições iniciais da rotina (ADR 020, S5 de docs/product/flow-initial-petitions-sprints.md): cada
 * petição é um documento do card pendente de aprovação do advogado; o Drive só recebe a versão aprovada.
 * O relatório da execução fica estruturado abaixo. Sem execução, a seção não aparece. Quem aprova também
 * envia a versão corrigida (S8) até a petição ter protocolo; o fecho incompleto (S7) aparece como aviso.
 */
export default function CardInitialPetitionsPanel({ boardId, cardId, onChanged, reloadKey = 0 }: CardInitialPetitionsPanelProps) {
  const [canApprove] = useState(() => getApplicationScopes("app:flow").some((scope) => PETITION_APPROVE_SCOPES.includes(scope)));
  const [run, setRun] = useState<InitialPetitionsRunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toApprove, setToApprove] = useState<InitialPetitionDto | null>(null);
  const [toCorrect, setToCorrect] = useState<InitialPetitionDto | null>(null);
  const [toRegister, setToRegister] = useState<InitialPetitionDto | null>(null);
  // Numero do processo (Sprint 2 de flow-card-actions): administrador do board ou responsavel pelo card.
  const [canRegisterProtocol, setCanRegisterProtocol] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const latest = await kanbanApi.initialPetitions.latest(boardId, cardId);
      setRun(latest.run);
      setCanRegisterProtocol(latest.canRegisterProtocol);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar as petições iniciais"));
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function download(petition: InitialPetitionDto) {
    if (!petition.document) return;
    setBusyId(petition.id);
    setError(null);
    try {
      const signed = await kanbanApi.initialPetitions.download(boardId, cardId, petition.document.documentId);
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao baixar a petição"));
    } finally {
      setBusyId(null);
    }
  }

  async function approve(petition: InitialPetitionDto) {
    if (!petition.document) return;
    setBusyId(petition.id);
    setError(null);
    try {
      setRun((await kanbanApi.initialPetitions.approve(boardId, cardId, petition.document.documentId)).run);
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao aprovar a petição"));
    } finally {
      setBusyId(null);
      setToApprove(null);
    }
  }

  if (loading) return null;
  if (!run) return error ? <Alert color="danger" className="small">{error}</Alert> : null;

  const outcome = petitionCompletionText(run);
  const report = run.report ?? {};
  return (
    <div className="mb-3 pb-3 border-bottom">
      <h6 className="text-muted mb-2 d-flex align-items-center gap-2">
        <span>
          <i className="ri-file-word-2-line me-1" />
          Petições iniciais
        </span>
        {run.status === "concluida" && <Badge color="primary" pill>{run.petitionCount}</Badge>}
      </h6>
      <div className="small text-muted mb-2">
        Execução de {formatLeadDate(run.createdAt)} · documento montado {run.generator === "flow" ? "pelo Flow" : "pela IA"}
        {run.triageSource === "hiscon" && " · sem Análise de Ações: triagem feita pelo HISCON"}
      </div>
      {error && <Alert color="danger" className="small py-2" toggle={() => setError(null)}>{error}</Alert>}
      {run.status === "nao_concluida" && (
        <Alert color="warning" className="small py-2 mb-2">
          <i className="ri-error-warning-line me-1" />
          {run.failureReason}
        </Alert>
      )}
      <div className={`small mb-2 ${TONE_CLASS[outcome.tone]}`}>{outcome.text}</div>
      {run.status === "concluida" && run.closingGaps.length > 0 && (
        <Alert color="warning" className="small py-2 mb-2">
          <i className="ri-quill-pen-line me-1" />
          Fecho incompleto:
          <ul className="mb-0 ps-3">
            {run.closingGaps.map((gap) => (
              <li key={gap}>{CLOSING_GAP_LABEL[gap] ?? gap}</li>
            ))}
          </ul>
        </Alert>
      )}

      {run.petitions.length > 0 && (
        <ul className="list-unstyled small mb-3">
          {run.petitions.map((petition) => {
            const status = documentStatusLabel(petition);
            const pending = petition.document?.status === "rascunho";
            return (
              <li key={petition.id} className="border rounded px-2 py-2 mb-1 d-flex flex-wrap align-items-center gap-2">
                <div className="flex-grow-1">
                  <div className="fw-medium text-break">{petition.fileName}</div>
                  <div className="text-muted">
                    {COURT_LABEL[petition.court]} · {petition.bank}
                    {petition.actionIds.length > 0 && ` · ${petition.actionIds.length} ${petition.actionIds.length === 1 ? "ação" : "ações"} da análise`}
                    {petition.document && petition.document.version > 1 && ` · versão corrigida (v${petition.document.version})`}
                    {petition.document?.approvedByName && ` · aprovada por ${petition.document.approvedByName}`}
                  </div>
                  {petition.protocolNumber && (
                    <div className="text-muted">
                      <i className="ri-hashtag me-1" />
                      Processo {formatCnjInput(petition.protocolNumber)}
                      {petition.monitoringCardId && petition.monitoringBoardId && (
                        <>
                          {" · "}
                          <a href={`/flow/boards/${petition.monitoringBoardId}?card=${petition.monitoringCardId}`}>
                            <i className="ri-radar-line me-1" />em monitoramento
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Badge color={status.color} className={`bg-${status.color}-subtle text-${status.color}`}>{status.text}</Badge>
                <Button size="sm" color="secondary" outline disabled={!petition.document || busyId === petition.id} onClick={() => void download(petition)}>
                  {busyId === petition.id ? <Spinner size="sm" /> : <><i className="ri-download-2-line me-1" />Baixar</>}
                </Button>
                {pending && canApprove && (
                  <Button size="sm" color="success" outline disabled={busyId === petition.id} onClick={() => setToApprove(petition)}>
                    <i className="ri-check-line me-1" />
                    Aprovar
                  </Button>
                )}
                {canRegisterProtocol && canRegisterProcessNumber(petition) && (
                  <Button size="sm" color="info" outline disabled={busyId === petition.id} onClick={() => setToRegister(petition)}>
                    <i className="ri-hashtag me-1" />
                    Registrar nº do processo
                  </Button>
                )}
                {canApprove && canSendCorrected(petition) && (
                  <Button size="sm" color="primary" outline disabled={busyId === petition.id} onClick={() => setToCorrect(petition)}>
                    <i className="ri-file-upload-line me-1" />
                    Enviar corrigida
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {run.petitions.some((petition) => petition.document?.status === "rascunho") && (
        <div className="small text-muted mb-2">
          Revise cada peça antes de aprovar: confira cada ementa no link da nota de rodapé e os dados em amarelo (XXXX).
          {canApprove
            ? " Com erro, baixe, corrija no Word e use \"Enviar corrigida\"."
            : " A aprovação é do advogado com a permissão \"Aprovar petição inicial\"."}
        </div>
      )}

      {run.status === "concluida" && (
        <div className="mt-2">
          <ReportList title="Pendências (XXXX)" items={report.pendingData ?? []} />
          <ReportList title="Decisões pendentes" items={report.pendingDecisions ?? []} />
          <ReportList title="Alertas" items={(report.alerts ?? []).map((alert) => `${ALERT_LABEL[alert.kind] ?? alert.kind}: ${alert.text}`)} />
          <ReportList title="Juízo a conferir" items={report.courtsToCheck ?? []} />
          <ReportList
            title="Contratos deixados de fora"
            items={(report.excludedContracts ?? []).map((item) => `${item.contract}${item.bank ? ` (${item.bank})` : ""}: ${item.reason}`)}
          />
          <ReportList title="Temas sem ementa do estado" items={report.themesWithoutStateRuling ?? []} />
          <ReportList
            title="Julgados usados"
            items={(report.precedents ?? []).map((item) => (
              <>
                {item.processNumber}
                {item.court && ` · ${item.court}`}
                {item.theme && ` · ${item.theme}`} ·{" "}
                <a href={item.url} target="_blank" rel="noopener noreferrer">link</a>
              </>
            ))}
          />
        </div>
      )}

      <ConfirmActionModal
        isOpen={toApprove !== null}
        title="Aprovar petição?"
        confirmLabel="Aprovar"
        color="success"
        icon="ri-check-double-line"
        busy={busyId !== null}
        onCancel={() => setToApprove(null)}
        onConfirm={() => toApprove && void approve(toApprove)}
      >
        {toApprove && (
          <>
            {toApprove.fileName} fica aprovada e vai para a pasta do cliente no Google Drive (quando o Drive da empresa
            está ligado). Confirme que revisou ementas, links e dados em XXXX.
          </>
        )}
      </ConfirmActionModal>
      <RegisterProcessNumberModal
        boardId={boardId}
        cardId={cardId}
        petition={toRegister}
        onClose={() => setToRegister(null)}
        onRegistered={(result) => {
          setRun(result.run);
          setCanRegisterProtocol(result.canRegisterProtocol);
          onChanged?.();
        }}
      />
      <CorrectedPetitionModal
        boardId={boardId}
        cardId={cardId}
        petition={toCorrect}
        onClose={() => setToCorrect(null)}
        onUploaded={(result) => {
          setRun(result.run);
          onChanged?.();
        }}
      />
    </div>
  );
}
