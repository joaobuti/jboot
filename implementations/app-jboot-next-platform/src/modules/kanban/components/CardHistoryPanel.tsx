"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Spinner } from "reactstrap";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { BoardMemberDto, CardActivityDto, CardAttachmentDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

interface CardHistoryPanelProps {
  boardId: string;
  cardId: string;
  onChanged?: () => void;
  readOnly?: boolean;
  /** Aviso em tempo real do card: recarrega a lista sem remontar (o rascunho do comentario fica). */
  reloadKey?: number;
}

const SYSTEM_EVENT_LABELS: Record<string, string> = {
  "card.moved": "moveu o card de coluna",
  // Acompanhamento do processo (ADR 021/022).
  juridico_process_changed: "Movimentação nova no processo (DataJud)",
  djen_publication_received: "Publicação recebida (DJEN)",
  "card.assignee_added": "atribuiu um responsavel",
  "card.assignee_removed": "removeu um responsavel",
  "card.archived": "arquivou o card",
  "card.title_updated": "editou o titulo",
  "card.description_updated": "editou a descricao",
  "card.status_changed": "alterou o status",
  "card.tag_added": "adicionou uma tag",
  "card.tag_removed": "removeu uma tag",
  "card.customer_linked": "vinculou o cliente",
  "card.customer_changed": "trocou o cliente",
  "card.customer_updated": "editou dados do cliente",
  "card.document_uploaded": "enviou um documento do checklist",
  "card.document_accepted": "aceitou um documento",
  "card.document_rejected": "rejeitou um documento",
  "card.extra_document_added": "adicionou um documento avulso",
  "card.extra_document_removed": "removeu um documento avulso",
  "card.signed_kit_uploaded": "enviou o kit assinado",
  "card.signed_kit_approved": "confirmou o kit assinado",
  "card.office_kit_emailed": "teve o kit enviado ao cliente por e-mail",
  // CRM de leads, Sprint 4.
  "card.lead_submitted": "enviou o lead para analise",
  "card.lead_returned": "devolveu o lead ao escritorio",
  // CRM de leads, Sprint 6. Classificacao e geracao so chegam ao gestor (P11, filtro no backend).
  "card.lead_case_classified": "classificou o caso do lead",
  "card.lead_case_changed": "trocou o tipo de caso",
  "card.lead_case_removed": "removeu um caso do lead",
  "card.lead_document_generated": "gerou um rascunho de documento",
  "card.lead_document_replaced": "substituiu o documento por versao editada",
  "card.lead_document_approved": "aprovou o documento do lead",
  "card.lead_analysis_status_changed": "atualizou o estado da analise",
  // Analise de Acoes (flow-action-analysis-sprints.md, A1).
  "card.action_analysis_registered": "registrou a analise de acoes",
  "card.automation_run_failed": "teve a automacao de IA encerrada sem concluir",
  "card.automation_completed": "concluiu a automacao de IA",
  // Conclusao explicita da IA (flow-ai-completion-sprints.md): dispara as regras "Quando a IA concluir".
  "ai.automation_completed": "teve a automacao de IA concluida sem erro",
  // Peticoes iniciais (ADR 020, S5).
  "card.initial_petitions_registered": "registrou as peticoes iniciais",
  "card.initial_petition_approved": "aprovou uma peticao inicial",
  "card.initial_petition_corrected": "enviou a versao corrigida de uma peticao inicial",
  // Acao Monitorar (flow-card-actions-sprints.md, Sprint 2).
  "card.initial_petition_protocol_registered": "registrou o numero do processo de uma peticao",
  "card.initial_petition_sent_to_monitoring": "enviou uma peticao para o board de monitoramento",
  "card.monitoring_card_created": "criou este card de monitoramento a partir de uma peticao",
};

const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  aguardando_revisao: "aguardando revisao",
  aprovado: "aprovado",
};

const RUN_FAILURE_LABELS: Record<string, string> = {
  routine_not_reached: "o Claude nao conseguiu acessar o Flow (tunel, conector ou autorizacao)",
  routine_no_answer: "o Claude parou de responder",
  routine_time_limit: "a execucao passou do tempo maximo (3 h para peticoes iniciais)",
  // Pre-condicoes das peticoes iniciais (ADR 020, S3): conferidas antes de chamar a rotina.
  card_without_customer: "o card nao tem cliente vinculado",
  customer_not_validated: "o cliente ainda nao tem validacao aprovada",
  customer_without_uf: "a ficha do cliente nao tem a UF do endereco",
  prior_lawsuits_missing: "a ficha do cliente nao tem as acoes ja ajuizadas nem a confirmacao de que nao ha nenhuma",
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Resumo do evento do acompanhamento; o texto inteiro da publicacao fica na lista do painel do card. */
function processEventSummary(kind: string, label: string, payload: Record<string, unknown>): string {
  if (kind === "juridico_process_changed") {
    const movements = Array.isArray(payload.novasMovimentacoes) ? (payload.novasMovimentacoes as Array<{ description?: unknown }>) : [];
    const names = movements.map((item) => (typeof item.description === "string" ? item.description : "")).filter(Boolean);
    return names.length > 0 ? `${label}: ${names.join("; ")}` : label;
  }
  const publication = (payload.publicacao ?? {}) as Record<string, unknown>;
  const parts = [publication.tipoComunicacao, publication.tipoDocumento].filter((value): value is string => typeof value === "string" && value.length > 0);
  const excerpt = typeof publication.trecho === "string" ? publication.trecho : "";
  const head = parts.length > 0 ? `${label}: ${parts.join(" · ")}` : label;
  return excerpt ? `${head} — ${excerpt}` : head;
}

function describeSystemEvent(activity: CardActivityDto): string {
  const kind = (activity.eventPayload?.kind as string) ?? "evento";
  const label = SYSTEM_EVENT_LABELS[kind] ?? kind;
  // Revisao de documento: payload traz o nome do tipo e, na rejeicao, o motivo (sem dado do arquivo).
  const typeName = activity.eventPayload?.documentTypeName;
  const reason = activity.eventPayload?.rejectionReason;
  if ((kind === "card.document_accepted" || kind === "card.document_rejected") && typeof typeName === "string") {
    return `${label} (${typeName})${typeof reason === "string" ? `: ${reason}` : ""}`;
  }
  // Devolucao do lead: o motivo digitado pelo gestor e o unico texto livre do evento.
  const returnReason = activity.eventPayload?.reason;
  if ((kind === "card.lead_returned" || kind === "card.lead_case_changed" || kind === "card.lead_case_removed") && typeof returnReason === "string") {
    return `${label}: ${returnReason}`;
  }
  const version = activity.eventPayload?.version;
  if ((kind === "card.lead_document_generated" || kind === "card.lead_document_approved" || kind === "card.lead_document_replaced") && typeof version === "number") {
    return `${label} (versao ${version})`;
  }
  // Analise de Acoes: total de acoes e o que aconteceu com o card.
  const actionCount = activity.eventPayload?.actionCount;
  if (kind === "card.action_analysis_registered" && typeof actionCount === "number") {
    if (activity.eventPayload?.status === "nao_concluida") return `${label} (nao concluida)`;
    const done = activity.eventPayload?.completed === true ? "; concluida sem erro" : "";
    return `${label} (${actionCount} ${actionCount === 1 ? "acao" : "acoes"}${done})`;
  }
  // Numero do processo da peticao (Sprint 2 de flow-card-actions).
  const processNumber = activity.eventPayload?.processNumber;
  if (
    (kind === "card.initial_petition_protocol_registered" || kind === "card.initial_petition_sent_to_monitoring" || kind === "card.monitoring_card_created") &&
    typeof processNumber === "string"
  ) {
    return `${label} (${processNumber})`;
  }
  // Peticoes iniciais: total e o que aconteceu com o card.
  const petitionCount = activity.eventPayload?.petitionCount;
  if (kind === "card.initial_petitions_registered" && typeof petitionCount === "number") {
    if (activity.eventPayload?.status === "nao_concluida") return `${label} (nao concluida)`;
    const done = activity.eventPayload?.completed === true ? "; concluida sem erro" : "";
    return `${label} (${petitionCount} ${petitionCount === 1 ? "peticao" : "peticoes"}${done})`;
  }
  // Conclusao sem erro com destino configurado: o que o Flow fez com o card.
  if (kind === "card.automation_completed") {
    const outcome = activity.eventPayload?.moveOutcome;
    const detail = activity.eventPayload?.moveDetail;
    if (outcome === "moved") return `${label}; card movido${typeof detail === "string" ? ` para "${detail}"` : ""}`;
    if (outcome === "card_moved_meanwhile") return `${label}; o card ja tinha saido da coluna e nao foi movido`;
    if (outcome === "blocked") return `${label}; card nao movido${typeof detail === "string" ? `: ${detail}` : ""}`;
    return label;
  }
  const runFailure = activity.eventPayload?.reason;
  if (kind === "card.automation_run_failed" && typeof runFailure === "string") {
    return `${label}: ${RUN_FAILURE_LABELS[runFailure] ?? runFailure}`;
  }
  const to = activity.eventPayload?.to;
  if (kind === "card.lead_analysis_status_changed" && typeof to === "string") {
    return `${label}: ${ANALYSIS_STATUS_LABELS[to] ?? to}`;
  }
  if (kind === "juridico_process_changed" || kind === "djen_publication_received") {
    return processEventSummary(kind, label, activity.eventPayload ?? {});
  }
  return label;
}

export default function CardHistoryPanel({ boardId, cardId, onChanged, readOnly = false, reloadKey = 0 }: CardHistoryPanelProps) {
  const [members, setMembers] = useState<BoardMemberDto[]>([]);
  const [activities, setActivities] = useState<CardActivityDto[]>([]);
  const [attachmentsByActivity, setAttachmentsByActivity] = useState<Map<string, CardAttachmentDto[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploadingActivityId, setUploadingActivityId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAttachActivityId, setPendingAttachActivityId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [membersResult, activitiesResult] = await Promise.all([
        kanbanApi.members.list(boardId),
        kanbanApi.activities.list(boardId, cardId),
      ]);
      setMembers(membersResult.data);
      setActivities(activitiesResult.data);

      const attachmentsEntries = await Promise.all(
        activitiesResult.data.map(async (activity) => {
          const attachments = await kanbanApi.attachments.list(boardId, cardId, activity.id);
          return [activity.id, attachments] as const;
        })
      );
      setAttachmentsByActivity(new Map(attachmentsEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar historico do card");
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (reloadKey > 0) void load();
  }, [reloadKey, load]);

  function memberDisplayName(identityId: string): string {
    const member = members.find((item) => item.identityId === identityId);
    return member?.displayName ?? shortId(identityId);
  }

  async function handlePostComment() {
    if (!newComment.trim()) {
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await kanbanApi.activities.createComment(boardId, cardId, newComment.trim());
      setNewComment("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao comentar");
    } finally {
      setPosting(false);
    }
  }

  function triggerAttach(activityId: string) {
    setPendingAttachActivityId(activityId);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const activityId = pendingAttachActivityId;
    event.target.value = "";
    setPendingAttachActivityId(null);
    if (!file || !activityId) {
      return;
    }
    setUploadingActivityId(activityId);
    setError(null);
    try {
      await kanbanApi.attachments.upload(boardId, cardId, activityId, file);
      await load();
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao enviar anexo"));
    } finally {
      setUploadingActivityId(null);
    }
  }

  async function handleDownload(activityId: string, attachmentId: string, fileName: string) {
    setError(null);
    try {
      const { url } = await kanbanApi.attachments.getDownloadUrl(boardId, cardId, activityId, attachmentId);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link de download");
    }
  }

  if (loading) {
    return (
      <div className="text-center py-3">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div>
      <input type="file" ref={fileInputRef} className="d-none" onChange={(event) => void handleFileSelected(event)} />

      {error && (
        <Alert color="danger" toggle={() => setError(null)} className="py-2">
          {error}
        </Alert>
      )}

      <h6 className="text-muted mb-2">Historico</h6>
      <div className="mb-3" style={{ maxHeight: 280, overflowY: "auto" }}>
        {activities.length === 0 && <p className="text-muted small">Nenhuma atividade ainda.</p>}
        {activities.map((activity) => {
          const attachments = attachmentsByActivity.get(activity.id) ?? [];
          const isComment = activity.type === "comment";
          const viaClaude = isComment && activity.eventPayload?.origin === "claude_connector";
          return (
            <div key={activity.id} className={`mb-2 p-2 rounded ${isComment ? "bg-light-subtle border" : ""}`}>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  {isComment ? (
                    <>
                      <strong className="small">{memberDisplayName(activity.authorIdentityId)}</strong>
                      {viaClaude && (
                        <span className="badge bg-info-subtle text-info ms-2" title="Comentario enviado pelo Claude em nome do usuario">
                          <i className="ri-plug-line me-1" />
                          via Claude
                        </span>
                      )}
                      <p className="mb-1 small" style={{ whiteSpace: "pre-wrap" }}>
                        {activity.textContent}
                      </p>
                    </>
                  ) : (
                    <p className="mb-1 small text-muted">
                      <i className="ri-information-line me-1" />
                      <strong>{memberDisplayName(activity.authorIdentityId)}</strong> {describeSystemEvent(activity)}
                    </p>
                  )}
                </div>
                <span className="text-muted" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                  {new Date(activity.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>

              {attachments.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {attachments.map((attachment) => (
                    <Button
                      key={attachment.id}
                      color="light"
                      size="sm"
                      className="py-0 px-2"
                      onClick={() => void handleDownload(activity.id, attachment.id, attachment.fileName)}
                    >
                      <i className="ri-attachment-2 me-1" />
                      {attachment.fileName}
                    </Button>
                  ))}
                </div>
              )}

              {!readOnly && (
                <Button
                  color="link"
                  size="sm"
                  className="p-0 mt-1 text-muted"
                  onClick={() => triggerAttach(activity.id)}
                  disabled={uploadingActivityId === activity.id}
                >
                  {uploadingActivityId === activity.id ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <i className="ri-attachment-2 me-1" />
                      Anexar arquivo
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="d-flex gap-2">
          <Input
            bsSize="sm"
            type="textarea"
            rows={2}
            placeholder="Escrever um comentario..."
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            disabled={posting}
          />
          <Button color="primary" size="sm" onClick={() => void handlePostComment()} disabled={posting || !newComment.trim()}>
            {posting ? <Spinner size="sm" /> : <i className="ri-send-plane-line" />}
          </Button>
        </div>
      )}
    </div>
  );
}
