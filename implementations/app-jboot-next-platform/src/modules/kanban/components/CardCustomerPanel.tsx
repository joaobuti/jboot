"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "reactstrap";
import CardCustomerModal, { CardCustomerModalMode } from "@/modules/kanban/components/CardCustomerModal";
import CardCustomerSummary from "@/modules/kanban/components/CardCustomerSummary";
import MissingHisconBadge from "@/modules/kanban/components/MissingHisconBadge";
import { CUSTOMER_DOCUMENT_ACCEPT, localFileError } from "@/modules/kanban/components/customers/CustomerDocumentsStep";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { CardCustomerPanelDto, CardHisconDto, KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";

interface CardCustomerPanelProps {
  boardId: string;
  cardId: string;
  /** Chamado apos vincular/trocar/editar (ex.: recarregar historico do card). */
  onChanged?: () => void;
  /** Muda quando chega aviso em tempo real do card: recarrega sem voltar ao carregando. */
  reloadKey?: number;
}

/**
 * Painel "Cliente" do card (CRM de leads). O backend so devolve o cliente a
 * membro ativo do quadro e decide `canEdit`; a UI nao duplica essa regra.
 */
export default function CardCustomerPanel({ boardId, cardId, onChanged, reloadKey = 0 }: CardCustomerPanelProps) {
  const [panel, setPanel] = useState<CardCustomerPanelDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [modalMode, setModalMode] = useState<CardCustomerModalMode | null>(null);
  const [hiscon, setHiscon] = useState<CardHisconDto | null>(null);
  const [hisconBusy, setHisconBusy] = useState(false);
  const [hisconError, setHisconError] = useState<string | null>(null);
  const hisconInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setForbidden(false);
    // Selo "SEM HISCON" e envio pelo card: falha so dele nao bloqueia o painel.
    void kanbanApi.cardHiscon
      .get(boardId, cardId)
      .then(setHiscon)
      .catch(() => setHiscon(null));
    try {
      setPanel(await kanbanApi.cardCustomer.get(boardId, cardId));
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof Error ? err.message : "Erro ao carregar cliente");
      }
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

  function handleSaved(next: CardCustomerPanelDto) {
    setPanel(next);
    onChanged?.();
  }

  const customer = panel?.customer ?? null;
  const canEdit = panel?.canEdit ?? false;

  async function handleHisconSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !hiscon?.customerId) {
      return;
    }
    const invalid = localFileError(file);
    if (invalid) {
      setHisconError(invalid);
      return;
    }
    setHisconBusy(true);
    setHisconError(null);
    try {
      await kanbanApi.customerDocuments.upload(hiscon.customerId, "extrato_beneficio", file);
      setHiscon(await kanbanApi.cardHiscon.get(boardId, cardId));
      onChanged?.();
    } catch (err) {
      setHisconError(describeKanbanError(err, "Erro ao enviar o HISCON"));
    } finally {
      setHisconBusy(false);
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="text-muted mb-0">Cliente</h6>
        {canEdit && !loading && (
          <div className="d-flex gap-1">
            {customer ? (
              <>
                <Button color="soft-primary" size="sm" onClick={() => setModalMode("edit")} title="Editar dados do cliente">
                  <i className="ri-edit-line me-1" />
                  Editar
                </Button>
                <Button color="soft-secondary" size="sm" onClick={() => setModalMode("change")} title="Vincular outro cliente">
                  <i className="ri-user-shared-line me-1" />
                  Trocar
                </Button>
              </>
            ) : (
              <Button color="soft-primary" size="sm" onClick={() => setModalMode("link")}>
                <i className="ri-user-add-line me-1" />
                Vincular cliente
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-2">
          <Spinner size="sm" />
        </div>
      ) : forbidden ? (
        <p className="text-muted small mb-0">Somente membros ativos deste quadro veem o cliente do card.</p>
      ) : error ? (
        <Alert color="danger" className="py-2 mb-0" toggle={() => setError(null)}>
          {error}
        </Alert>
      ) : customer ? (
        <>
          <CardCustomerSummary customer={customer} />
          {hiscon?.missing && (
            <div className="border rounded p-2 mt-2">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="small">
                  <MissingHisconBadge missing />
                  <div className="text-muted mt-1">
                    O cliente foi validado sem HISCON. O card só entra nas colunas que exigem o HISCON depois do envio.
                  </div>
                </div>
                {hiscon.canUpload && (
                  <>
                    <input
                      ref={hisconInputRef}
                      type="file"
                      className="d-none"
                      accept={CUSTOMER_DOCUMENT_ACCEPT}
                      onChange={(event) => void handleHisconSelected(event)}
                    />
                    <Button color="soft-primary" size="sm" onClick={() => hisconInputRef.current?.click()} disabled={hisconBusy}>
                      {hisconBusy ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-2-line me-1" />}
                      Enviar HISCON
                    </Button>
                  </>
                )}
              </div>
              {hisconError && (
                <Alert color="danger" className="py-2 mt-2 mb-0" toggle={() => setHisconError(null)}>
                  {hisconError}
                </Alert>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-muted small mb-0">Nenhum cliente vinculado.</p>
      )}

      <CardCustomerModal
        boardId={boardId}
        cardId={cardId}
        mode={modalMode}
        customer={customer}
        onClose={() => {
          setModalMode(null);
          // Recarrega sempre: o vinculo pode ter sido gravado mesmo com erro posterior
          // (ex.: falha ao salvar dado juridico), e o painel deve refletir o backend.
          void load();
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}
