"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "reactstrap";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { CardSignatureDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { CUSTOMER_DOCUMENT_ACCEPT, localFileError } from "@/modules/kanban/components/customers/CustomerDocumentsStep";

const RUN_ERROR_LABEL: Record<string, string> = {
  routine_not_reached: "a rotina não chegou ao Flow em 5 minutos",
  routine_no_answer: "a rotina parou sem dar o parecer",
  signed_kit_replaced: "uma versão nova do kit assinado foi enviada",
  signature_agent_not_routine: "o agente da ação não é uma rotina Claude",
};

const FINDING_BADGE: Record<string, string> = {
  ok: "bg-success-subtle text-success",
  pendente: "bg-warning-subtle text-warning",
  ilegivel: "bg-secondary-subtle text-secondary",
  divergente: "bg-danger-subtle text-danger",
};

/** Situacao do kit assinado em uma linha: o que a pessoa ve ao lado do arquivo. */
export function signatureStatus(view: CardSignatureDto): { badge: string; text: string; icon: string } | null {
  const run = view.validation;
  if (!view.signed) return null;
  if (view.approved) return { badge: "bg-success-subtle text-success", text: "Assinatura aprovada", icon: "ri-checkbox-circle-line" };
  if (!run || !run.current) {
    return { badge: "bg-secondary-subtle text-secondary", text: "Aguardando validação", icon: "ri-time-line" };
  }
  if (run.status === "dispatching" || run.status === "dispatched") {
    return { badge: "bg-info-subtle text-info", text: "Validando assinatura", icon: "ri-loader-4-line" };
  }
  if (run.status === "answered") {
    return run.verdict === "aprovado"
      ? { badge: "bg-info-subtle text-info", text: "IA aprovou: aguardando confirmação", icon: "ri-user-follow-line" }
      : { badge: "bg-warning-subtle text-warning", text: "IA apontou pendências", icon: "ri-error-warning-line" };
  }
  const reason = run.errorCode ? RUN_ERROR_LABEL[run.errorCode] ?? `falha (${run.errorCode})` : "falha";
  return { badge: "bg-danger-subtle text-danger", text: `Validação não concluída: ${reason}`, icon: "ri-close-circle-line" };
}

interface Props {
  boardId: string;
  cardId: string;
  kitId: string;
  onChanged?: () => void;
  reloadKey?: number;
}

/**
 * Kit assinado no item do kit do bloco Documentos (docs/product/flow-signed-kit-sprints.md, S2 e S5): envio da
 * versao assinada, parecer do Validador de assinatura e confirmacao humana. A validacao parte da acao
 * "Validar assinatura" da coluna (botao do card), nunca daqui. Permissoes vem do backend.
 */
export default function CardSignedKitSection({ boardId, cardId, kitId, onChanged, reloadKey = 0 }: Props) {
  const [view, setView] = useState<CardSignatureDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await kanbanApi.officeKit.signature(boardId, cardId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar o kit assinado"));
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function run(action: () => Promise<CardSignatureDto>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      setView(await action());
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = localFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    await run(() => kanbanApi.officeKit.uploadSigned(boardId, cardId, kitId, file), "Erro ao enviar o kit assinado");
  }

  async function download() {
    if (!view?.signed) return;
    setError(null);
    try {
      const signed = await kanbanApi.officeKit.downloadSigned(boardId, cardId, kitId, view.signed.id);
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao baixar o kit assinado"));
    }
  }

  if (!view || view.kitId !== kitId) {
    return error ? <Alert color="danger" className="py-2 mt-2 mb-0">{error}</Alert> : null;
  }
  const status = signatureStatus(view);
  const runView = view.validation?.current ? view.validation : null;
  // Sem parecer util para a versao atual: a validacao e pedida pela acao da coluna.
  const awaitingAction = Boolean(view.signed) && !view.approved
    && (!runView || runView.status === "failed" || runView.status === "expired" || runView.verdict === "pendencias");

  return (
    <div className="border-top mt-2 pt-2">
      <input ref={inputRef} type="file" className="d-none" accept={CUSTOMER_DOCUMENT_ACCEPT} onChange={(event) => void handleFile(event)} />
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div className="me-auto" style={{ minWidth: 0 }}>
          <div className="small fw-medium">Kit assinado</div>
          {view.signed ? (
            <Button color="link" size="sm" className="p-0 text-start text-truncate d-block" style={{ maxWidth: "100%" }} onClick={() => void download()}>
              <i className="ri-quill-pen-line me-1" />
              {view.signed.fileName} (versão {view.signed.version})
            </Button>
          ) : (
            <div className="small text-muted">Envie o kit assinado pelo cliente (PDF ou fotos das páginas).</div>
          )}
        </div>
        {status && (
          <span className={`badge ${status.badge}`}>
            <i className={`${status.icon} me-1`} />
            {status.text}
          </span>
        )}
      </div>

      {runView?.status === "answered" && runView.summary && (
        <div className="small mt-2">
          <div className="text-muted">{runView.summary}</div>
          {runView.findings.length > 0 && (
            <ul className="list-unstyled mb-0 mt-1">
              {runView.findings.map((finding, index) => (
                <li key={`${finding.item}-${index}`} className="d-flex gap-2 align-items-start">
                  <span className={`badge ${FINDING_BADGE[finding.status] ?? "bg-light text-muted"}`}>{finding.status}</span>
                  <span>
                    {finding.item}
                    {finding.note && <span className="text-muted">: {finding.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {awaitingAction && (
        <div className="small text-muted mt-2">
          <i className="ri-information-line me-1" />
          Para validar, use a ação &quot;Validar assinatura&quot; do card. Ela aparece nas colunas em que o administrador a configurou.
        </div>
      )}

      {error && (
        <Alert color="danger" className="py-2 mt-2 mb-0" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2 mt-2">
        {view.canUpload && !view.approved && (
          <Button color="soft-primary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-2-line me-1" />}
            {view.signed ? "Enviar nova versão" : "Enviar kit assinado"}
          </Button>
        )}
        {view.canConfirm && runView && (
          <Button color="soft-success" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            <i className="ri-check-double-line me-1" />
            Confirmar assinatura
          </Button>
        )}
      </div>

      <ConfirmActionModal
        isOpen={confirming}
        title="Confirmar o kit assinado?"
        confirmLabel="Confirmar"
        color="success"
        icon="ri-check-double-line"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (runView) void run(() => kanbanApi.officeKit.confirmSignatureValidation(boardId, cardId, kitId, runView.id), "Erro ao confirmar");
        }}
      >
        A IA aprovou o kit assinado. Confirme que conferiu as assinaturas: o kit passa a valer como assinado, vai para a
        pasta do cliente no Google Drive (quando o Drive da empresa está ligado) e libera as colunas que exigem o kit
        assinado. Se a coluna tiver a regra &quot;Quando o kit assinado for aprovado&quot;, o card anda sozinho em até um minuto.
      </ConfirmActionModal>
    </div>
  );
}
