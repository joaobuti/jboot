"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Progress, Spinner } from "reactstrap";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";
import {
  CardChecklistDto,
  CardChecklistItemDto,
  CardDocumentDto,
  CardExtraDocumentDto,
  CardExtraDocumentsDto,
  CardOfficeKitDto,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import {
  CHECKLIST_STATE_LABELS,
  DOCUMENT_CAMERA_ACCEPT,
  DOCUMENT_FILE_ACCEPT,
  describeKanbanError,
  validateDocumentFile,
} from "@/modules/kanban/lib/card-documents";
import ChecklistPendingBadge from "@/modules/kanban/components/ChecklistPendingBadge";
import CardSignedKitSection from "@/modules/kanban/components/CardSignedKitSection";

interface CardDocumentsPanelProps {
  boardId: string;
  cardId: string;
  /** Envio/revisao mudou o card: recarrega tile (completude) e historico. */
  onChanged?: () => void;
  /** Muda quando chega aviso em tempo real do card: recarrega sem voltar ao carregando. */
  reloadKey?: number;
}

type PickerSource = "file" | "camera";

/** Situacao do e-mail do kit ao cliente (S4 de flow-signed-kit-sprints.md), em uma linha. */
export function kitEmailStatus(email: NonNullable<CardOfficeKitDto["email"]>): string {
  if (email.status === "sent") {
    return `Enviado por e-mail para ${email.to}${email.sentAt ? ` em ${new Date(email.sentAt).toLocaleDateString("pt-BR")}` : ""}.`;
  }
  if (email.status === "failed") return `Não foi possível enviar por e-mail para ${email.to}. Baixe o kit e envie manualmente.`;
  return `Envio por e-mail para ${email.to} na fila.`;
}

/**
 * Checklist de documentos do lead (CRM de leads, Sprint 2). Permissoes vem do
 * backend (`canUpload`, `canReview`); a UI nao decide quem envia nem quem revisa.
 */
export default function CardDocumentsPanel({ boardId, cardId, onChanged, reloadKey = 0 }: CardDocumentsPanelProps) {
  const [checklist, setChecklist] = useState<CardChecklistDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTypeId, setBusyTypeId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ documentId: string; reason: string } | null>(null);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [officeKit, setOfficeKit] = useState<CardOfficeKitDto | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [extras, setExtras] = useState<CardExtraDocumentsDto | null>(null);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraBusy, setExtraBusy] = useState(false);
  const [toRemove, setToRemove] = useState<CardExtraDocumentDto | null>(null);
  const extraInputRef = useRef<HTMLInputElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTypeRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    // O kit nao bloqueia o checklist: falha so dele aparece no proprio aviso.
    const kitRequest = kanbanApi.officeKit
      .latest(boardId, cardId)
      .then((result) => setOfficeKit(result.kit))
      .catch((err) => setError(describeKanbanError(err, "Erro ao carregar o kit do escritorio")));
    const extrasRequest = kanbanApi.extraDocuments
      .list(boardId, cardId)
      .then(setExtras)
      .catch((err) => setError(describeKanbanError(err, "Erro ao carregar os outros documentos")));
    try {
      setChecklist(await kanbanApi.cardDocuments.checklist(boardId, cardId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar documentos"));
    } finally {
      await Promise.all([kitRequest, extrasRequest]);
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

  function pick(documentTypeId: string, source: PickerSource) {
    pendingTypeRef.current = documentTypeId;
    (source === "camera" ? cameraInputRef : fileInputRef).current?.click();
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const documentTypeId = pendingTypeRef.current;
    event.target.value = "";
    pendingTypeRef.current = null;
    if (!file || !documentTypeId) {
      return;
    }
    const invalid = validateDocumentFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusyTypeId(documentTypeId);
    setError(null);
    try {
      await kanbanApi.cardDocuments.upload(boardId, cardId, documentTypeId, file);
      await load();
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao enviar documento"));
    } finally {
      setBusyTypeId(null);
    }
  }

  async function handleAccept(item: CardChecklistItemDto, document: CardDocumentDto) {
    setBusyTypeId(item.documentTypeId);
    setError(null);
    try {
      await kanbanApi.cardDocuments.review(boardId, cardId, document.id, { status: "aceito" });
      await load();
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao aceitar documento"));
    } finally {
      setBusyTypeId(null);
    }
  }

  async function handleReject(item: CardChecklistItemDto) {
    if (!rejecting || !rejecting.reason.trim()) {
      return;
    }
    setBusyTypeId(item.documentTypeId);
    setError(null);
    try {
      await kanbanApi.cardDocuments.review(boardId, cardId, rejecting.documentId, {
        status: "rejeitado",
        rejectionReason: rejecting.reason.trim(),
      });
      setRejecting(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao rejeitar documento"));
    } finally {
      setBusyTypeId(null);
    }
  }

  async function handleDownload(document: CardDocumentDto) {
    setError(null);
    try {
      const { url } = await kanbanApi.attachments.getDownloadUrl(
        boardId,
        cardId,
        document.attachment.activityId,
        document.attachment.id
      );
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.attachment.fileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao gerar link de download"));
    }
  }

  async function handleExtraSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const invalid = validateDocumentFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setExtraBusy(true);
    setError(null);
    try {
      await kanbanApi.extraDocuments.upload(boardId, cardId, file, extraDescription);
      setExtraDescription("");
      setExtras(await kanbanApi.extraDocuments.list(boardId, cardId));
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao enviar o documento"));
    } finally {
      setExtraBusy(false);
    }
  }

  async function handleExtraRemove(document: CardExtraDocumentDto) {
    setExtraBusy(true);
    setError(null);
    try {
      await kanbanApi.extraDocuments.remove(boardId, cardId, document.id);
      setToRemove(null);
      setExtras(await kanbanApi.extraDocuments.list(boardId, cardId));
      onChanged?.();
    } catch (err) {
      setToRemove(null);
      setError(describeKanbanError(err, "Erro ao remover o documento"));
    } finally {
      setExtraBusy(false);
    }
  }

  async function handleExtraDownload(document: CardExtraDocumentDto) {
    setError(null);
    try {
      const { url } = await kanbanApi.attachments.getDownloadUrl(boardId, cardId, document.attachment.activityId, document.attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao gerar link de download"));
    }
  }

  async function handleKitDownload(kit: CardOfficeKitDto) {
    setKitBusy(true);
    setError(null);
    try {
      const signed = await kanbanApi.officeKit.download(boardId, cardId, kit.id);
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao baixar o kit do escritorio"));
    } finally {
      setKitBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h6 className="text-muted mb-2">Documentos</h6>
        <Spinner size="sm" />
      </div>
    );
  }

  const completeness = checklist?.completeness;
  const percent =
    completeness && completeness.totalRequired > 0
      ? Math.round((completeness.acceptedRequired / completeness.totalRequired) * 100)
      : 0;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        className="d-none"
        accept={DOCUMENT_FILE_ACCEPT}
        onChange={(event) => void handleFileSelected(event)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="d-none"
        accept={DOCUMENT_CAMERA_ACCEPT}
        capture="environment"
        onChange={(event) => void handleFileSelected(event)}
      />

      <div className="d-flex align-items-center justify-content-between flex-wrap gap-1 mb-2">
        <h6 className="text-muted mb-0">Documentos</h6>
        <div className="d-flex flex-wrap gap-1">
          <ChecklistPendingBadge pending={checklist?.checklistPending} />
          {completeness && completeness.totalRequired > 0 && (
            <span
              className={`badge ${completeness.complete ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
              title="Obrigatorios aceitos / total de obrigatorios"
            >
              <i className="ri-file-list-3-line me-1" />
              {completeness.acceptedRequired}/{completeness.totalRequired} obrigatorios aceitos
            </span>
          )}
        </div>
      </div>
      {completeness && completeness.totalRequired > 0 && (
        <Progress
          value={percent}
          color={completeness.complete ? "success" : "warning"}
          className="mb-2"
          style={{ height: 4 }}
        />
      )}

      {error && (
        <Alert color="danger" toggle={() => setError(null)} className="py-2">
          {error}
        </Alert>
      )}

      {officeKit && (
        <div className="border rounded p-2 mb-2">
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
            <div className="me-auto" style={{ minWidth: 0 }}>
              <div className="fw-medium small">Kit do escritorio</div>
              <Button
                color="link"
                size="sm"
                className="p-0 text-start text-truncate d-block"
                style={{ maxWidth: "100%" }}
                onClick={() => void handleKitDownload(officeKit)}
                disabled={kitBusy}
              >
                {kitBusy ? <Spinner size="sm" className="me-1" /> : <i className="ri-file-word-2-line me-1" />}
                {officeKit.fileName}
              </Button>
            </div>
            <span className="badge bg-info-subtle text-info" title="Gerado na confirmacao da validacao do cliente">
              <i className="ri-shield-check-line me-1" />
              Gerado em {new Date(officeKit.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
          {officeKit.email && <div className="small text-muted mt-1">{kitEmailStatus(officeKit.email)}</div>}
          <CardSignedKitSection boardId={boardId} cardId={cardId} kitId={officeKit.id} onChanged={onChanged} reloadKey={reloadKey} />
        </div>
      )}

      {checklist && checklist.items.length === 0 && (
        <p className="text-muted small mb-0">Nenhum tipo de documento configurado neste quadro.</p>
      )}

      {checklist && checklist.items.length > 0 && (
        <ul className="list-unstyled mb-0">
          {checklist.items.map((item) => {
            const state = CHECKLIST_STATE_LABELS[item.state];
            const current = item.current;
            const busy = busyTypeId === item.documentTypeId;
            const canReviewCurrent = checklist.canReview && current?.status === "enviado";
            const isRejecting = rejecting !== null && current !== null && rejecting.documentId === current.id;
            const previous = item.history.slice(1);
            return (
              <li key={item.documentTypeId} className="border rounded p-2 mb-2">
                <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <div className="me-auto" style={{ minWidth: 0 }}>
                    <div className="fw-medium small">
                      {item.name}
                      {item.required ? <span className="text-danger ms-1">*</span> : null}
                      {!item.active && <span className="badge bg-dark-subtle text-dark ms-2">Tipo inativo</span>}
                    </div>
                    {current && (
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 text-start text-truncate d-block"
                        style={{ maxWidth: "100%" }}
                        onClick={() => void handleDownload(current)}
                      >
                        <i className="ri-attachment-2 me-1" />
                        {current.attachment.fileName}
                      </Button>
                    )}
                  </div>
                  <span className={`badge ${state.badge}`}>
                    <i className={`${state.icon} me-1`} />
                    {state.label}
                  </span>
                </div>

                {item.state === "rejeitado" && current?.rejectionReason && (
                  <p className="small text-danger mb-1 mt-1">
                    <i className="ri-error-warning-line me-1" />
                    Motivo: {current.rejectionReason}
                  </p>
                )}

                {isRejecting && rejecting && (
                  <div className="mt-2">
                    <Input
                      bsSize="sm"
                      type="textarea"
                      rows={2}
                      maxLength={1000}
                      placeholder="Motivo da rejeicao (obrigatorio)"
                      value={rejecting.reason}
                      onChange={(event) => setRejecting({ ...rejecting, reason: event.target.value })}
                      disabled={busy}
                      autoFocus
                    />
                    <div className="d-flex justify-content-end gap-2 mt-2">
                      <Button color="light" size="sm" onClick={() => setRejecting(null)} disabled={busy}>
                        Cancelar
                      </Button>
                      <Button
                        color="danger"
                        size="sm"
                        onClick={() => void handleReject(item)}
                        disabled={busy || !rejecting.reason.trim()}
                      >
                        {busy ? <Spinner size="sm" className="me-1" /> : null}
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                )}

                {!isRejecting && (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {checklist.canUpload && item.active && (
                      <>
                        <Button
                          color="soft-primary"
                          size="sm"
                          onClick={() => pick(item.documentTypeId, "file")}
                          disabled={busy}
                        >
                          {busy ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-2-line me-1" />}
                          {current ? "Enviar novo" : "Enviar arquivo"}
                        </Button>
                        <Button
                          color="soft-secondary"
                          size="sm"
                          onClick={() => pick(item.documentTypeId, "camera")}
                          disabled={busy}
                          title="Fotografar o documento com a camera do celular"
                        >
                          <i className="ri-camera-line me-1" />
                          Foto
                        </Button>
                      </>
                    )}
                    {canReviewCurrent && current && (
                      <>
                        <Button color="soft-success" size="sm" onClick={() => void handleAccept(item, current)} disabled={busy}>
                          <i className="ri-check-line me-1" />
                          Aceitar
                        </Button>
                        <Button
                          color="soft-danger"
                          size="sm"
                          onClick={() => setRejecting({ documentId: current.id, reason: "" })}
                          disabled={busy}
                        >
                          <i className="ri-close-line me-1" />
                          Rejeitar
                        </Button>
                      </>
                    )}
                    {previous.length > 0 && (
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 text-muted ms-auto"
                        onClick={() => setExpandedTypeId(expandedTypeId === item.documentTypeId ? null : item.documentTypeId)}
                      >
                        {expandedTypeId === item.documentTypeId ? "Ocultar" : "Ver"} envios anteriores ({previous.length})
                      </Button>
                    )}
                  </div>
                )}

                {expandedTypeId === item.documentTypeId && previous.length > 0 && (
                  <ul className="list-unstyled small mt-2 mb-0 border-top pt-2">
                    {previous.map((document) => (
                      <li key={document.id} className="d-flex flex-wrap align-items-center gap-2 mb-1">
                        <span className={`badge ${CHECKLIST_STATE_LABELS[document.status].badge}`}>
                          {CHECKLIST_STATE_LABELS[document.status].label}
                        </span>
                        <Button color="link" size="sm" className="p-0" onClick={() => void handleDownload(document)}>
                          {document.attachment.fileName}
                        </Button>
                        <span className="text-muted">{new Date(document.createdAt).toLocaleString("pt-BR")}</span>
                        {document.rejectionReason && <span className="text-danger">Motivo: {document.rejectionReason}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {extras && (
        <div className="mt-3">
          <input
            ref={extraInputRef}
            type="file"
            className="d-none"
            accept={DOCUMENT_FILE_ACCEPT}
            onChange={(event) => void handleExtraSelected(event)}
          />
          <div className="fw-medium small mb-1">Outros documentos</div>
          <p className="text-muted small mb-2">Documentos fora do checklist do quadro, com descrição opcional.</p>
          {extras.documents.length === 0 && <p className="text-muted small mb-2">Nenhum outro documento.</p>}
          {extras.documents.length > 0 && (
            <ul className="list-unstyled mb-2">
              {extras.documents.map((document) => (
                <li key={document.id} className="border rounded p-2 mb-2">
                  <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                    <div className="me-auto" style={{ minWidth: 0 }}>
                      {document.description && <div className="fw-medium small">{document.description}</div>}
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 text-start text-truncate d-block"
                        style={{ maxWidth: "100%" }}
                        onClick={() => void handleExtraDownload(document)}
                      >
                        <i className="ri-attachment-2 me-1" />
                        {document.attachment.fileName}
                      </Button>
                      <span className="text-muted small">{new Date(document.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    {document.canRemove && (
                      <Button color="soft-danger" size="sm" onClick={() => setToRemove(document)} disabled={extraBusy}>
                        <i className="ri-delete-bin-line me-1" />
                        Remover
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {extras.canUpload && (
            <div className="d-flex flex-wrap gap-2">
              <Input
                bsSize="sm"
                className="flex-grow-1"
                style={{ minWidth: 160, width: "auto" }}
                maxLength={200}
                placeholder="Descrição (opcional)"
                value={extraDescription}
                onChange={(event) => setExtraDescription(event.target.value)}
                disabled={extraBusy}
              />
              <Button color="soft-primary" size="sm" onClick={() => extraInputRef.current?.click()} disabled={extraBusy}>
                {extraBusy ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-2-line me-1" />}
                Adicionar documento
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmActionModal
        isOpen={toRemove !== null}
        title="Remover documento?"
        confirmLabel="Remover"
        color="danger"
        icon="ri-delete-bin-line"
        busy={extraBusy}
        onCancel={() => setToRemove(null)}
        onConfirm={() => toRemove && void handleExtraRemove(toRemove)}
      >
        {toRemove && (
          <>
            {toRemove.description ?? toRemove.attachment.fileName} sai do bloco Documentos do card. Com o Google Drive da
            empresa ligado, o arquivo também vai para a lixeira do Drive. O histórico do card registra a remoção.
          </>
        )}
      </ConfirmActionModal>
    </div>
  );
}
