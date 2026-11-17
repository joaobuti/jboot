"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import { CardDto, CardLeadDto, OfficeContextDto } from "@/modules/kanban/lib/kanban-api";
import { getApplicationScopes } from "@/lib/module-auth-token";
import CardHistoryPanel from "@/modules/kanban/components/CardHistoryPanel";
import CardSourceMonitoringPanel from "@/modules/kanban/components/CardSourceMonitoringPanel";
import CardMonitoringCadenceControl from "@/modules/kanban/components/CardMonitoringCadenceControl";
import CardMonitoringToggle from "@/modules/kanban/components/CardMonitoringToggle";
import CardDjenControl from "@/modules/kanban/components/CardDjenControl";
import CardAssigneesPanel from "@/modules/kanban/components/CardAssigneesPanel";
import CardTagsPanel from "@/modules/kanban/components/CardTagsPanel";
import CardStatusSelect from "@/modules/kanban/components/CardStatusSelect";
import CardCustomerPanel from "@/modules/kanban/components/CardCustomerPanel";
import CardDocumentsPanel from "@/modules/kanban/components/CardDocumentsPanel";
import CardOfficeTransferModal from "@/modules/kanban/components/CardOfficeTransferModal";
import CardLeadPanel from "@/modules/kanban/components/CardLeadPanel";
import CardAnalysisPanel from "@/modules/kanban/components/CardAnalysisPanel";
import CardLeadDocumentsPanel from "@/modules/kanban/components/CardLeadDocumentsPanel";
import CardActionAnalysisPanel from "@/modules/kanban/components/CardActionAnalysisPanel";
import CardInitialPetitionsPanel from "@/modules/kanban/components/CardInitialPetitionsPanel";
import { shouldShowAnalysisPanel } from "@/modules/kanban/lib/lead-analysis";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { newCardOfficeChoice, officeNameMap, USER_WITHOUT_OFFICE_MESSAGE } from "@/modules/kanban/lib/offices";
import { shouldShowLeadPanel } from "@/modules/kanban/lib/leads";

interface CardModalCreateState {
  mode: "create";
  boardColumnId: string;
}

interface CardModalEditState {
  mode: "edit";
  card: CardDto;
}

export type CardModalState = CardModalCreateState | CardModalEditState;

interface CardModalProps {
  boardId: string;
  state: CardModalState | null;
  onClose: () => void;
  onCreate: (
    boardColumnId: string,
    title: string,
    description: string | null,
    dueDate: string | null,
    officeId?: string
  ) => Promise<void>;
  onSave: (cardId: string, title: string, description: string | null, dueDate: string | null) => Promise<void>;
  onArchive: (cardId: string) => Promise<void>;
  onChanged?: () => void;
  /** `board_viewer`: campos somente leitura e sem salvar/arquivar/monitorar (o backend ja recusa com 403). */
  readOnly?: boolean;
  /** Contexto de escritorio (Sprint 3.5); `null` quando nao carregou (tela segue sem escritorio). */
  officeContext?: OfficeContextDto | null;
  /** Ultimo aviso `card.updated` do board (docs/product/flow-realtime-card-updates-sprints.md, R1). */
  liveUpdate?: CardLiveUpdate | null;
}

/** `seq` muda a cada aviso, inclusive repetido para o mesmo card. */
export interface CardLiveUpdate {
  cardId: string;
  kind: string;
  seq: number;
}

export default function CardModal({
  boardId,
  state,
  onClose,
  onCreate,
  onSave,
  onArchive,
  onChanged,
  readOnly = false,
  officeContext = null,
  liveUpdate = null,
}: CardModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monitoringActive, setMonitoringActive] = useState<boolean | undefined>(undefined);
  // Remonta o historico apos mudanca de cliente para exibir o system_event novo.
  const [historyVersion, setHistoryVersion] = useState(0);
  const [officeId, setOfficeId] = useState("");
  // Escritorio exibido no modal: atualiza na hora apos a transferencia.
  const [cardOfficeId, setCardOfficeId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Envio do lead (Sprint 4): lead enviado congela os campos do card ate a devolucao (P21).
  const [leadFrozen, setLeadFrozen] = useState(false);
  // Sprint 6: estado do lead (painel de analise do gestor / documentos entregues ao escritorio).
  const [leadState, setLeadState] = useState<CardLeadDto | null>(null);
  const [analysisReload, setAnalysisReload] = useState(0);
  // Dica de UI (o backend exige `flow:admin` em toda rota da analise).
  const [isFlowAdmin] = useState(() => getApplicationScopes("app:flow").includes("flow:admin"));
  // Remonta Cliente/Documentos apos envio/devolucao (canEdit/canUpload mudam no backend).
  const [panelsVersion, setPanelsVersion] = useState(0);
  // Recalcula o que falta para o envio quando cliente ou documentos mudam.
  const [leadReload, setLeadReload] = useState(0);
  // Aviso em tempo real do card aberto: recarrega os paineis sem desmontar.
  const [liveReload, setLiveReload] = useState(0);
  const liveCardId = state?.mode === "edit" ? state.card.id : null;

  useEffect(() => {
    if (!liveUpdate || liveUpdate.cardId !== liveCardId) return;
    setLiveReload((value) => value + 1);
    setLeadReload((value) => value + 1);
    setAnalysisReload((value) => value + 1);
  }, [liveUpdate, liveCardId]);

  // O BoardView recria `state` a cada recarga de cards (inclusive pelos avisos em tempo real): o
  // formulario so volta ao valor salvo quando troca o card aberto, para nao apagar edicao em andamento.
  const formKey = state ? (state.mode === "edit" ? `edit:${state.card.id}` : `create:${state.boardColumnId}`) : null;
  useEffect(() => {
    if (!state) {
      return;
    }
    setError(null);
    setMonitoringActive(undefined);
    setOfficeId("");
    setTransferOpen(false);
    setLeadFrozen(false);
    setLeadState(null);
    if (state.mode === "edit") {
      setCardOfficeId(state.card.officeId);
      setTitle(state.card.title);
      setDescription(state.card.description ?? "");
      setDueDate(state.card.dueDate ?? "");
    } else {
      setTitle("");
      setDescription("");
      setDueDate("");
    }
    // Reset so na troca de card: depender de `state` apagaria a edicao a cada recarga do board.
  }, [formKey]);

  if (!state) {
    return null;
  }

  const currentState = state;
  const isEdit = currentState.mode === "edit";
  // Escolha do escritorio na criacao (Sprint 3.5): automatico com um, obrigatorio com varios ou admin.
  const officeChoice = newCardOfficeChoice(officeContext);
  const officeNames = officeNameMap(officeContext?.offices ?? []);
  const createBlocked = !isEdit && officeChoice.mode === "blocked";
  const officeMissing = !isEdit && officeChoice.mode === "choose" && !officeId;
  const fieldsReadOnly = readOnly || leadFrozen;
  const showOfficeRow =
    isEdit && officeContext !== null && (officeContext.officeVisibilityEnabled || officeContext.isAdmin || cardOfficeId !== null);

  async function handleSave() {
    if (!title.trim()) {
      setError("Informe um titulo para o card");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (currentState.mode === "edit") {
        await onSave(currentState.card.id, title.trim(), description.trim() || null, dueDate || null);
      } else {
        if (officeMissing) {
          setError("Escolha o escritorio do card");
          setSaving(false);
          return;
        }
        await onCreate(
          currentState.boardColumnId,
          title.trim(),
          description.trim() || null,
          dueDate || null,
          officeChoice.mode === "choose" ? officeId : undefined
        );
      }
      onClose();
    } catch (err) {
      // Criar card direto em coluna com checklist obrigatorio devolve 422 checklist_incomplete.
      setError(describeKanbanError(err, "Erro ao salvar card"));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (currentState.mode !== "edit") {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onArchive(currentState.card.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao arquivar card");
      setSaving(false);
    }
  }

  return (
    <Modal isOpen toggle={onClose} centered scrollable size="xl" className="kanban-card-modal">
      {isEdit ? (
        <div className="modal-header">
          <Input
            id="card-title"
            autoFocus
            bsSize="lg"
            className="border-0 bg-transparent fw-bold px-0 flex-grow-1 me-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={saving}
            readOnly={fieldsReadOnly}
          />
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {!readOnly && (
              <div className="d-flex align-items-center gap-1">
                <CardMonitoringToggle
                  cardId={currentState.card.id}
                  sourceType={currentState.card.sourceType}
                  onChange={setMonitoringActive}
                />
                <CardMonitoringCadenceControl
                  cardId={currentState.card.id}
                  sourceType={currentState.card.sourceType}
                  monitoringOverride={monitoringActive}
                />
                <CardDjenControl cardId={currentState.card.id} sourceType={currentState.card.sourceType} />
              </div>
            )}
            <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
          </div>
        </div>
      ) : (
        <ModalHeader toggle={onClose}>Novo card</ModalHeader>
      )}
      <ModalBody>
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className="row g-3">
          <div className="col-md-6">
            {isEdit ? (
              <>
                {showOfficeRow && (
                  <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                    <span className="small">
                      <i className="ri-building-line me-1 text-muted" />
                      <span className="text-muted me-1">Escritorio:</span>
                      {cardOfficeId ? (
                        <strong>{officeNames.get(cardOfficeId) ?? "Escritorio"}</strong>
                      ) : (
                        <span className="badge bg-warning-subtle text-warning">Sem escritorio</span>
                      )}
                    </span>
                    {officeContext?.isAdmin && (
                      <Button color="link" size="sm" className="p-0" onClick={() => setTransferOpen(true)}>
                        <i className="ri-arrow-left-right-line me-1" />
                        {cardOfficeId ? "Transferir" : "Atribuir escritorio"}
                      </Button>
                    )}
                  </div>
                )}
                <CardLeadSection
                  boardId={boardId}
                  cardId={currentState.card.id}
                  reloadKey={leadReload}
                  onLoaded={(lead) => {
                    setLeadFrozen(!lead.editable);
                    setLeadState(lead);
                  }}
                  onTransition={() => {
                    setPanelsVersion((value) => value + 1);
                    setHistoryVersion((value) => value + 1);
                    setAnalysisReload((value) => value + 1);
                    onChanged?.();
                  }}
                />
                {leadState && shouldShowAnalysisPanel(leadState.status, leadState.currentSubmission !== null) &&
                  (isFlowAdmin ? (
                    <CardAnalysisPanel
                      boardId={boardId}
                      cardId={currentState.card.id}
                      reloadKey={analysisReload}
                      onChanged={() => {
                        setLeadReload((value) => value + 1);
                        setHistoryVersion((value) => value + 1);
                        onChanged?.();
                      }}
                    />
                  ) : (
                    <CardLeadDocumentsPanel boardId={boardId} cardId={currentState.card.id} reloadKey={leadReload} />
                  ))}
                <div className="mb-3 pb-3 border-bottom">
                  <CardCustomerPanel
                    key={`customer-${panelsVersion}`}
                    boardId={boardId}
                    cardId={currentState.card.id}
                    reloadKey={liveReload}
                    onChanged={() => {
                      setHistoryVersion((value) => value + 1);
                      setLeadReload((value) => value + 1);
                    }}
                  />
                </div>
                <CardActionAnalysisPanel
                  key={`action-analysis-${panelsVersion}`}
                  boardId={boardId}
                  cardId={currentState.card.id}
                  reloadKey={liveReload}
                />
                <CardInitialPetitionsPanel
                  key={`initial-petitions-${panelsVersion}`}
                  boardId={boardId}
                  cardId={currentState.card.id}
                  reloadKey={liveReload}
                  onChanged={() => setHistoryVersion((value) => value + 1)}
                />
                <div className="mb-3 pb-3 border-bottom">
                  <CardDocumentsPanel
                    key={`documents-${panelsVersion}`}
                    boardId={boardId}
                    cardId={currentState.card.id}
                    reloadKey={liveReload}
                    onChanged={() => {
                      setHistoryVersion((value) => value + 1);
                      setLeadReload((value) => value + 1);
                      onChanged?.();
                    }}
                  />
                </div>
                <div className="mb-3">
                  <CardAssigneesPanel boardId={boardId} cardId={currentState.card.id} onChanged={onChanged} readOnly={readOnly} />
                </div>
                <div className="mb-3">
                  <h6 className="text-muted mb-2">Status</h6>
                  <CardStatusSelect
                    boardId={boardId}
                    cardId={currentState.card.id}
                    initialCardStatusId={currentState.card.cardStatusId}
                    onChanged={onChanged}
                  />
                </div>
                <div className="mb-3">
                  <CardTagsPanel boardId={boardId} cardId={currentState.card.id} onChanged={onChanged} />
                </div>
              </>
            ) : (
              <>
              {createBlocked && (
                <Alert color="warning">
                  <i className="ri-building-line me-1" />
                  {USER_WITHOUT_OFFICE_MESSAGE}
                </Alert>
              )}
              {officeChoice.mode === "choose" && (
                <FormGroup>
                  <Label for="card-office">
                    Escritorio<span className="text-danger ms-1">*</span>
                  </Label>
                  <Input
                    id="card-office"
                    type="select"
                    value={officeId}
                    onChange={(event) => setOfficeId(event.target.value)}
                    disabled={saving}
                  >
                    <option value="">Selecione o escritorio...</option>
                    {officeChoice.options.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              )}
              {officeChoice.mode === "auto" && (
                <p className="small text-muted">
                  <i className="ri-building-line me-1" />
                  Escritorio: <strong>{officeChoice.office.name}</strong>
                </p>
              )}
              <FormGroup>
                <Label for="card-title">Titulo</Label>
                <Input
                  id="card-title"
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  disabled={saving}
                />
              </FormGroup>
              </>
            )}
            <FormGroup className="mb-0">
              <Label for="card-description">Descricao</Label>
              <Input
                id="card-description"
                type="textarea"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={saving}
                readOnly={fieldsReadOnly}
              />
            </FormGroup>
            <FormGroup className="mt-3 mb-0">
              <Label for="card-due-date">Vencimento</Label>
              <Input
                id="card-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={saving || fieldsReadOnly}
              />
            </FormGroup>
          </div>
          <div className="col-md-6 border-start">
            {isEdit ? (
              <>
                <CardSourceMonitoringPanel
                  cardId={currentState.card.id}
                  sourceType={currentState.card.sourceType}
                  sourceUrl={currentState.card.sourceUrl}
                />
                <CardHistoryPanel
                  key={historyVersion}
                  boardId={boardId}
                  cardId={currentState.card.id}
                  reloadKey={liveReload}
                  onChanged={onChanged}
                  readOnly={readOnly}
                />
              </>
            ) : (
              <div className="text-muted small">
                <h6 className="text-muted mb-2">Cliente</h6>
                <p className="small mb-3">Disponivel depois de salvar o card.</p>
                <h6 className="text-muted mb-2">Documentos</h6>
                <p className="small mb-3">Disponivel depois de salvar o card.</p>
                <h6 className="text-muted mb-2">Status</h6>
                <p className="small mb-3">Disponivel depois de salvar o card.</p>
                <h6 className="text-muted mb-2">Tags</h6>
                <p className="small mb-3">Disponivel depois de salvar o card.</p>
                <h6 className="text-muted mb-2">Responsaveis</h6>
                <p className="small mb-3">Disponivel depois de salvar o card.</p>
                <h6 className="text-muted mb-2">Historico</h6>
                <p className="small mb-0">
                  Comentarios, atribuicoes e anexos ficam disponiveis depois que o card e salvo pela primeira vez.
                </p>
              </div>
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter className="d-flex justify-content-between">
        <div>
          {isEdit && !readOnly && leadFrozen && (
            <span className="small text-muted">
              <i className="ri-lock-line me-1" />
              Lead enviado para análise: edição bloqueada até a devolução.
            </span>
          )}
          {isEdit && !fieldsReadOnly && (
            <Button color="link" className="text-muted ps-0" onClick={() => void handleArchive()} disabled={saving}>
              <i className="ri-archive-line me-1" />
              Arquivar card
            </Button>
          )}
        </div>
        <div className="d-flex gap-2">
          <Button color="light" onClick={onClose} disabled={saving}>
            {fieldsReadOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!fieldsReadOnly && (
            <Button color="primary" onClick={() => void handleSave()} disabled={saving || !title.trim() || createBlocked || officeMissing}>
              {saving ? <Spinner size="sm" className="me-1" /> : null}
              Salvar
            </Button>
          )}
        </div>
      </ModalFooter>
      {isEdit && officeContext?.isAdmin && (
        <CardOfficeTransferModal
          isOpen={transferOpen}
          boardId={boardId}
          cardId={currentState.card.id}
          currentOfficeId={cardOfficeId}
          offices={officeContext.offices}
          onClose={() => setTransferOpen(false)}
          onTransferred={(nextOfficeId) => {
            setCardOfficeId(nextOfficeId);
            setHistoryVersion((value) => value + 1);
            onChanged?.();
          }}
        />
      )}
    </Modal>
  );
}

/** Painel do envio com o separador so quando ele aparece (quadro sem captacao e sem envio nao muda). */
function CardLeadSection(props: React.ComponentProps<typeof CardLeadPanel>) {
  const [visible, setVisible] = useState(false);
  const { onLoaded } = props;
  return (
    <div className={visible ? "mb-3 pb-3 border-bottom" : undefined}>
      <CardLeadPanel
        {...props}
        onLoaded={(lead) => {
          setVisible(shouldShowLeadPanel(lead));
          onLoaded?.(lead);
        }}
      />
    </div>
  );
}
