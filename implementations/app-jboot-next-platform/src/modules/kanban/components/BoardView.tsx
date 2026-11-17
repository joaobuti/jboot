"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
  type DropResult,
} from "@hello-pangea/dnd";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Input, Spinner } from "reactstrap";
import type { Socket } from "socket.io-client";
import {
  BoardColumnDto,
  BoardDto,
  BoardActionsDto,
  CardActionDto,
  BoardMemberDto,
  CardDto,
  CardStatusDto,
  CardTagDto,
  kanbanApi,
  OfficeContextDto,
} from "@/modules/kanban/lib/kanban-api";
import {
  connectKanbanSocket,
  type CardMovedEvent,
  type CardUpdatedEvent,
  type KanbanSocketErrorEvent,
} from "@/modules/kanban/lib/kanban-socket";
import CardModal, { type CardLiveUpdate, type CardModalState } from "@/modules/kanban/components/CardModal";
import { checklistIndicator, describeKanbanError } from "@/modules/kanban/lib/card-documents";
import ChecklistPendingBadge from "@/modules/kanban/components/ChecklistPendingBadge";
import MissingHisconBadge from "@/modules/kanban/components/MissingHisconBadge";
import SignedKitPendingBadge from "@/modules/kanban/components/SignedKitPendingBadge";
import LeadStatusBadge from "@/modules/kanban/components/LeadStatusBadge";
import { isBoardContentDenied } from "@/modules/kanban/lib/board-access";
import { canMutateBoard } from "@/modules/kanban/lib/board-permissions";
import { actionsForCard, actionsForColumn } from "@/modules/kanban/lib/card-actions";
import CardActionButtons from "@/modules/kanban/components/CardActionButtons";
import { cardProcessLine } from "@/modules/kanban/lib/card-process-line";
import {
  filterCardsByOffice,
  isUserWithoutOffice,
  OFFICE_FILTER_ALL,
  OFFICE_FILTER_NONE,
  officeNameMap,
  USER_WITHOUT_OFFICE_MESSAGE,
} from "@/modules/kanban/lib/offices";

const CARD_QUERY_PARAM = "card";
/** Espera curta para juntar avisos seguidos (ex.: peticoes registradas + conclusao da IA) numa recarga. */
const LIVE_RELOAD_DELAY_MS = 400;

interface BoardViewProps {
  boardId: string;
}

export default function BoardView({ boardId }: BoardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [board, setBoard] = useState<BoardDto | null>(null);
  const [columns, setColumns] = useState<BoardColumnDto[]>([]);
  const [cards, setCards] = useState<CardDto[]>([]);
  const [tags, setTags] = useState<CardTagDto[]>([]);
  const [statuses, setStatuses] = useState<CardStatusDto[]>([]);
  const [members, setMembers] = useState<BoardMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Leitura de conteudo do quadro exige membresia ativa (backend: 403 board_membership_required).
  const [noAccess, setNoAccess] = useState(false);
  const [contentReadable, setContentReadable] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Renomear o board (board_admin): lapis a esquerda do nome. */
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [boardActions, setBoardActions] = useState<BoardActionsDto | null>(null);
  const [actionsLoadError, setActionsLoadError] = useState<string | null>(null);

  const [newColumnName, setNewColumnName] = useState("");
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [creatingForColumnId, setCreatingForColumnId] = useState<string | null>(null);

  const [filters, setFilters] = useState({ search: "", cardStatusId: "", tagId: "" });
  // Escritorios (Sprint 3.5): contexto do usuario e filtro do administrador (sobre os cards ja visiveis).
  const [officeContext, setOfficeContext] = useState<OfficeContextDto | null>(null);
  const [officeFilter, setOfficeFilter] = useState(OFFICE_FILTER_ALL);

  const socketRef = useRef<Socket | null>(null);
  // Avisos em tempo real (docs/product/flow-realtime-card-updates-sprints.md, R1): o board junta
  // avisos seguidos numa recarga so; o modal do card aberto recarrega os paineis.
  const [liveUpdate, setLiveUpdate] = useState<CardLiveUpdate | null>(null);
  const liveSeqRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openCardId = searchParams.get(CARD_QUERY_PARAM);

  const modalState: CardModalState | null = creatingForColumnId
    ? { mode: "create", boardColumnId: creatingForColumnId }
    : openCardId
      ? (() => {
          const card = cards.find((item) => item.id === openCardId);
          return card ? { mode: "edit", card } : null;
        })()
      : null;

  function openCard(cardId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(CARD_QUERY_PARAM, cardId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function closeModal() {
    setCreatingForColumnId(null);
    if (openCardId) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(CARD_QUERY_PARAM);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    }
  }

  const isBoardAdmin = board?.currentUserRole === "board_admin";
  // `board_viewer` apenas le: sem arrastar, sem criar card, campos do card somente leitura.
  const canMutate = canMutateBoard(board?.currentUserRole);

  const loadActions = useCallback(async () => {
    try {
      setBoardActions(await kanbanApi.actions.list(boardId));
      setActionsLoadError(null);
    } catch (error) {
      setBoardActions(null);
      setActionsLoadError(describeKanbanError(error, "Erro ao carregar ações do board"));
    }
  }, [boardId]);

  useEffect(() => {
    if (!contentReadable) return;
    void loadActions();
    const refresh = () => { void loadActions(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [contentReadable, loadActions]);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const boardResult = await kanbanApi.boards.get(boardId);
      // GET do quadro responde a qualquer usuario do tenant; sem papel nao ha leitura de conteudo.
      if (isBoardContentDenied(boardResult)) {
        setBoard(boardResult);
        setNoAccess(true);
        return;
      }
      const [columnsResult, tagsResult, statusesResult, membersResult, officeContextResult] = await Promise.all([
        kanbanApi.columns.list(boardId),
        kanbanApi.tags.list(boardId),
        kanbanApi.statuses.list(boardId),
        kanbanApi.members.list(boardId),
        // Sem contexto de escritorio o quadro segue funcionando (sem selos nem seletor).
        kanbanApi.offices.context().catch(() => null),
      ]);
      setOfficeContext(officeContextResult);
      setBoard(boardResult);
      setColumns(columnsResult.data.sort((a, b) => a.position - b.position));
      setTags(tagsResult.data);
      setStatuses(statusesResult.data);
      setMembers(membersResult.data);
      setNoAccess(false);
      setContentReadable(true);
    } catch (err) {
      if (isBoardContentDenied(null, err)) {
        setNoAccess(true);
      } else {
        setLoadError(err instanceof Error ? err.message : "Erro ao carregar board");
      }
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  // Filtros (busca/status/tag) e a lista de cards recarregam juntos, independente do resto do board
  // (colunas, tags, status, membros não mudam quando o usuário só troca um filtro).
  const loadCards = useCallback(async () => {
    // Cards e realtime so depois de confirmar que o usuario le o conteudo do quadro.
    if (!contentReadable) {
      return;
    }
    try {
      const cardsResult = await kanbanApi.cards.list(boardId, {
        search: filters.search.trim() || undefined,
        cardStatusId: filters.cardStatusId || undefined,
        tagId: filters.tagId || undefined,
      });
      setCards(cardsResult.data);
    } catch {
      // realtime reconciliation failure is non-blocking; next manual refresh recovers
    }
  }, [boardId, filters, contentReadable]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!contentReadable) {
      return;
    }
    const socket = connectKanbanSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("board.join", { boardId });
    });

    socket.on("card.moved", (_event: CardMovedEvent) => {
      void loadCards();
    });

    socket.on("card.updated", (event: CardUpdatedEvent) => {
      if (event.boardId !== boardId) return;
      liveSeqRef.current += 1;
      setLiveUpdate({ cardId: event.cardId, kind: event.kind, seq: liveSeqRef.current });
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => void loadCards(), LIVE_RELOAD_DELAY_MS);
    });

    socket.on("error", (event: KanbanSocketErrorEvent) => {
      setActionError(event.message);
    });

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      socket.emit("board.leave", { boardId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boardId, loadCards, contentReadable]);

  const officeNames = useMemo(() => officeNameMap(officeContext?.offices ?? []), [officeContext]);
  const withoutOffice = isUserWithoutOffice(officeContext);
  const showOfficeFilter = officeContext?.isAdmin === true && officeContext.offices.length > 0;

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, CardDto[]>();
    const visible = filterCardsByOffice(cards, officeFilter);
    for (const column of columns) {
      map.set(
        column.id,
        visible
          .filter((card) => card.boardColumnId === column.id)
          .sort((a, b) => a.position - b.position)
      );
    }
    return map;
  }, [columns, cards, officeFilter]);

  async function handleCreateColumn(event: React.FormEvent) {
    event.preventDefault();
    if (!newColumnName.trim()) {
      return;
    }
    setCreatingColumn(true);
    setActionError(null);
    try {
      await kanbanApi.columns.create(boardId, {
        name: newColumnName.trim(),
        position: columns.length,
      });
      setNewColumnName("");
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao criar coluna");
    } finally {
      setCreatingColumn(false);
    }
  }

  async function handleArchiveColumn(columnId: string) {
    setActionError(null);
    try {
      await kanbanApi.columns.archive(boardId, columnId);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao arquivar coluna");
    }
  }

  async function handleCreateCard(
    boardColumnId: string,
    title: string,
    description: string | null,
    dueDate: string | null,
    officeId?: string
  ) {
    const created = await kanbanApi.cards.create(boardId, { boardColumnId, title, description, dueDate, officeId });
    await loadCards();
    setCreatingForColumnId(null);
    openCard(created.id);
  }

  async function handleSaveCard(cardId: string, title: string, description: string | null, dueDate: string | null) {
    await kanbanApi.cards.update(boardId, cardId, { title, description, dueDate });
    await loadCards();
  }

  async function handleArchiveCard(cardId: string) {
    await kanbanApi.cards.archive(boardId, cardId);
    await loadCards();
  }

  async function handleColumnDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.index === source.index) {
      return;
    }

    const reordered = [...columns];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    setColumns(reordered);

    try {
      await kanbanApi.columns.update(boardId, draggableId, { position: destination.index });
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reordenação de coluna rejeitada");
      await loadAll();
    }
  }

  async function handleCardDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) {
      return;
    }
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const movingCard = cards.find((card) => card.id === draggableId);
    if (!movingCard) {
      return;
    }

    setCards((previous) =>
      previous.map((card) => (card.id === draggableId ? { ...card, boardColumnId: destination.droppableId, position: destination.index } : card))
    );

    try {
      await kanbanApi.cards.move(boardId, draggableId, {
        toBoardColumnId: destination.droppableId,
        toPosition: destination.index,
      });
    } catch (err) {
      // Recarregar devolve o card a coluna de origem (desfaz o movimento otimista).
      setActionError(describeKanbanError(err, "Movimentação rejeitada"));
      await loadCards();
    }
  }

  async function handleDragEnd(result: DropResult) {
    if (!canMutate) {
      return;
    }
    if (result.type === "COLUMN") {
      return handleColumnDragEnd(result);
    }
    return handleCardDragEnd(result);
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (noAccess) {
    return (
      <Alert color="warning">
        <i className="ri-lock-line me-2" />
        <strong>Sem acesso a este quadro.</strong> Somente membros ativos do quadro{board ? ` "${board.name}"` : ""} veem
        cards, documentos e historico. Peca acesso ao administrador do quadro.
        <div className="mt-2">
          <Link href="/flow/boards" className="btn btn-light btn-sm">
            <i className="ri-arrow-left-line me-1" />
            Voltar aos quadros
          </Link>
        </div>
      </Alert>
    );
  }

  if (loadError || !board) {
    return (
      <Alert color="danger">
        <i className="ri-error-warning-line me-2" />
        {loadError ?? "Board não encontrado"}
      </Alert>
    );
  }

  async function saveBoardName() {
    const name = nameDraft.trim();
    if (!board || !name || savingName) return;
    if (name === board.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setActionError(null);
    try {
      const updated = await kanbanApi.boards.update(board.id, { name });
      setBoard((current) => (current ? { ...current, name: updated.name } : current));
      setEditingName(false);
    } catch (error) {
      setActionError(describeKanbanError(error, "Não foi possível renomear o board"));
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          {editingName ? (
            <form
              className="d-flex align-items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveBoardName();
              }}
            >
              <Input
                bsSize="sm"
                value={nameDraft}
                maxLength={160}
                autoFocus
                disabled={savingName}
                aria-label="Nome do board"
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") setEditingName(false); }}
                style={{ minWidth: 260 }}
              />
              <Button size="sm" color="primary" type="submit" disabled={savingName || !nameDraft.trim()}>
                {savingName ? <Spinner size="sm" /> : "Salvar"}
              </Button>
              <Button size="sm" color="light" type="button" disabled={savingName} onClick={() => setEditingName(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <div className="d-flex align-items-center gap-2">
              {isBoardAdmin && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost-secondary btn-icon"
                  title="Renomear board"
                  aria-label="Renomear board"
                  onClick={() => { setNameDraft(board.name); setEditingName(true); }}
                >
                  <i className="ri-pencil-line" />
                </button>
              )}
              <h4 className="mb-0">{board.name}</h4>
            </div>
          )}
          {board.description && <p className="text-muted small mb-0">{board.description}</p>}
        </div>
        <div className="d-flex gap-2">
          {(isBoardAdmin || board.currentUserCapabilities?.canManageTags || board.currentUserCapabilities?.canManageStatuses) && (
            <Link href={`/flow/boards/${boardId}/settings/tags-status`} className="btn btn-light btn-sm">
              <i className="ri-price-tag-3-line me-1" />
              Tags e Status
            </Link>
          )}
          {isBoardAdmin && (
            <Link href={`/flow/boards/${boardId}/settings/profiles`} className="btn btn-light btn-sm">
              <i className="ri-shield-user-line me-1" />
              Perfis
            </Link>
          )}
          {isBoardAdmin && (
            <Link href={`/flow/boards/${boardId}/settings/documents`} className="btn btn-light btn-sm">
              <i className="ri-file-list-3-line me-1" />
              Documentos
            </Link>
          )}
          {isBoardAdmin && (
            <Link href={`/flow/boards/${boardId}/settings/automations`} className="btn btn-light btn-sm">
              <i className="ri-mail-send-line me-1" />
              Automacoes
            </Link>
          )}
          {boardActions?.canConfigure && (
            <Link href={`/flow/boards/${boardId}/settings/actions`} className="btn btn-light btn-sm">
              <i className="ri-flashlight-line me-1" />Ações
            </Link>
          )}
        </div>
      </div>

      {actionError && (
        <Alert color="danger" toggle={() => setActionError(null)}>
          <i className="ri-error-warning-line me-2" />
          {actionError}
        </Alert>
      )}

      {actionsLoadError && <Alert color="warning">{actionsLoadError} <Button color="link" size="sm" onClick={() => void loadActions()}>Tentar novamente</Button></Alert>}

      {withoutOffice && (
        <Alert color="warning">
          <i className="ri-building-line me-2" />
          {USER_WITHOUT_OFFICE_MESSAGE}
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Input
          bsSize="sm"
          style={{ maxWidth: 240 }}
          placeholder="Buscar por titulo ou descricao..."
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
        />
        <Input
          bsSize="sm"
          type="select"
          style={{ maxWidth: 200 }}
          value={filters.cardStatusId}
          onChange={(event) => setFilters((prev) => ({ ...prev, cardStatusId: event.target.value }))}
        >
          <option value="">Todos os status</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </Input>
        <Input
          bsSize="sm"
          type="select"
          style={{ maxWidth: 200 }}
          value={filters.tagId}
          onChange={(event) => setFilters((prev) => ({ ...prev, tagId: event.target.value }))}
        >
          <option value="">Todas as tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Input>
        {showOfficeFilter && (
          <Input
            bsSize="sm"
            type="select"
            style={{ maxWidth: 220 }}
            value={officeFilter}
            onChange={(event) => setOfficeFilter(event.target.value)}
            aria-label="Filtrar por escritorio"
          >
            <option value={OFFICE_FILTER_ALL}>Todos os escritorios</option>
            <option value={OFFICE_FILTER_NONE}>Sem escritorio</option>
            {officeContext?.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
                {office.active ? "" : " (inativo)"}
              </option>
            ))}
          </Input>
        )}
        {(filters.search || filters.cardStatusId || filters.tagId || officeFilter !== OFFICE_FILTER_ALL) && (
          <Button
            color="link"
            size="sm"
            className="text-muted"
            onClick={() => {
              setFilters({ search: "", cardStatusId: "", tagId: "" });
              setOfficeFilter(OFFICE_FILTER_ALL);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
        <Droppable droppableId="board-columns" direction="horizontal" type="COLUMN">
          {(columnsProvided) => (
            <div
              className="d-flex gap-3 overflow-auto pb-3"
              style={{ alignItems: "flex-start" }}
              ref={columnsProvided.innerRef}
              {...columnsProvided.droppableProps}
            >
              {columns.map((column, index) => (
                <Draggable draggableId={column.id} index={index} key={column.id} isDragDisabled={!isBoardAdmin}>
                  {(columnDragProvided) => (
                    <div ref={columnDragProvided.innerRef} {...columnDragProvided.draggableProps}>
                      <ColumnPanel
                        boardId={boardId}
                        actions={actionsForColumn(boardActions, column.id)}
                        boardActions={boardActions}
                        onActionDone={() => { void loadActions(); void loadCards(); }}
                        canExecuteActions={Boolean(boardActions?.canExecute && (canMutate || boardActions.canConfigure))}
                        column={column}
                        cards={cardsByColumn.get(column.id) ?? []}
                        tags={tags}
                        statuses={statuses}
                        members={members}
                        isBoardAdmin={isBoardAdmin}
                        canMutate={canMutate}
                        canCreateCard={canMutate && !withoutOffice}
                        officeNames={officeNames}
                        dragHandleProps={columnDragProvided.dragHandleProps}
                        onOpenCreateCard={() => setCreatingForColumnId(column.id)}
                        onOpenCard={(cardId) => openCard(cardId)}
                        onArchiveColumn={() => void handleArchiveColumn(column.id)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {columnsProvided.placeholder}

              {isBoardAdmin && (
                <div className="card" style={{ minWidth: 260 }}>
                  <div className="card-body">
                    <h6 className="card-title">Nova coluna</h6>
                    <form className="d-flex flex-column gap-2" onSubmit={(e) => void handleCreateColumn(e)}>
                      <Input
                        placeholder="Nome da coluna"
                        value={newColumnName}
                        onChange={(event) => setNewColumnName(event.target.value)}
                        disabled={creatingColumn}
                      />
                      <Button color="primary" size="sm" type="submit" disabled={creatingColumn || !newColumnName.trim()}>
                        {creatingColumn ? <Spinner size="sm" className="me-1" /> : null}
                        Adicionar coluna
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <CardModal
        boardId={boardId}
        state={modalState}
        onClose={closeModal}
        onCreate={handleCreateCard}
        onSave={handleSaveCard}
        onArchive={handleArchiveCard}
        onChanged={() => { void loadCards(); void loadActions(); }}
        readOnly={!canMutate}
        officeContext={officeContext}
        liveUpdate={liveUpdate}
      />
    </div>
  );
}

interface ColumnPanelProps {
  boardId: string;
  actions: CardActionDto[];
  /** Disponibilidade por card das acoes de tela (Monitorar). */
  boardActions: BoardActionsDto | null;
  /** Acao concluida: recarrega disponibilidade das acoes e cards (o card novo pode estar neste board). */
  onActionDone: () => void;
  canExecuteActions: boolean;
  column: BoardColumnDto;
  cards: CardDto[];
  tags: CardTagDto[];
  statuses: CardStatusDto[];
  members: BoardMemberDto[];
  isBoardAdmin: boolean;
  canMutate: boolean;
  /** Sem escritorio (Sprint 3.5) o usuario nao cria card; o backend tambem recusa (403). */
  canCreateCard: boolean;
  officeNames: Map<string, string>;
  dragHandleProps: DraggableProvidedDragHandleProps | null;
  onOpenCreateCard: () => void;
  onOpenCard: (cardId: string) => void;
  onArchiveColumn: () => void;
}

function ColumnPanel({
  boardId,
  actions,
  boardActions,
  onActionDone,
  canExecuteActions,
  column,
  cards,
  tags,
  statuses,
  members,
  isBoardAdmin,
  canMutate,
  canCreateCard,
  officeNames,
  dragHandleProps,
  onOpenCreateCard,
  onOpenCard,
  onArchiveColumn,
}: ColumnPanelProps) {
  const wipExceeded = column.wipLimit !== null && cards.length >= column.wipLimit;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card" style={{ minWidth: 280 }}>
      <div className="card-header d-flex align-items-center justify-content-between" {...dragHandleProps} style={{ cursor: isBoardAdmin ? "grab" : "default" }}>
        <span>
          {column.name}{" "}
          {column.requiresCompleteChecklist && (
            <i
              className="ri-lock-line text-muted ms-1"
              title="So entra card com todos os documentos obrigatorios aceitos"
              aria-label="Exige checklist completo"
            />
          )}
          {column.wipLimit !== null && (
            <span className={`badge ms-1 ${wipExceeded ? "bg-danger-subtle text-danger" : "bg-secondary-subtle text-secondary"}`}>
              {cards.length}/{column.wipLimit}
            </span>
          )}
        </span>
        {isBoardAdmin && (
          <Button color="link" size="sm" className="p-0 text-muted" onClick={onArchiveColumn} title="Arquivar coluna">
            <i className="ri-delete-bin-line" />
          </Button>
        )}
      </div>
      <Droppable droppableId={column.id}>
        {(provided) => (
          <div className="card-body" ref={provided.innerRef} {...provided.droppableProps} style={{ minHeight: 80 }}>
            {cards.map((card, index) => (
              <Draggable draggableId={card.id} index={index} key={card.id} isDragDisabled={!canMutate}>
                {(dragProvided) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className="card mb-2 shadow-sm"
                    role="button"
                    onClick={() => onOpenCard(card.id)}
                  >
                    <div className="card-body py-2 px-3">
                      <div>{card.title}</div>
                      {(() => {
                        const processLine = cardProcessLine(card);
                        return processLine ? <div className="small text-muted">{processLine}</div> : null;
                      })()}

                      {(() => {
                        const cardStatus = statuses.find((status) => status.id === card.cardStatusId);
                        const isOverdue = Boolean(card.dueDate && card.dueDate < today);
                        const cardTags = card.tagIds
                          .map((tagId) => tags.find((tag) => tag.id === tagId))
                          .filter((tag): tag is CardTagDto => Boolean(tag));
                        const checklist = checklistIndicator(card.documentChecklist);
                        const officeName = card.officeId ? officeNames.get(card.officeId) : undefined;
                        if (
                          !cardStatus &&
                          cardTags.length === 0 &&
                          !card.dueDate &&
                          !checklist &&
                          !card.checklistPending &&
                          !officeName &&
                          !card.leadStatus &&
                          !card.customerWithoutHiscon &&
                          !card.signedKitPending
                        ) {
                          return null;
                        }
                        return (
                          <div className="d-flex flex-wrap gap-1 mt-2">
                            {officeName && (
                              <span className="badge bg-info-subtle text-info" title="Escritorio do card">
                                <i className="ri-building-line me-1" />
                                {officeName}
                              </span>
                            )}
                            {/* Estado do lead (Sprint 4): so com envio; independente da coluna. */}
                            <LeadStatusBadge status={card.leadStatus} />
                            <ChecklistPendingBadge pending={card.checklistPending} />
                            <MissingHisconBadge missing={card.customerWithoutHiscon} />
                            <SignedKitPendingBadge pending={card.signedKitPending} />
                            {checklist && (
                              <span
                                className={`badge ${checklist.complete ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
                                title="Documentos obrigatorios aceitos / total"
                              >
                                <i className="ri-file-list-3-line me-1" />
                                {checklist.label}
                              </span>
                            )}
                            {card.dueDate && (
                              <span className={`badge ${isOverdue ? "bg-danger-subtle text-danger" : "bg-secondary-subtle text-secondary"}`}>
                                <i className="ri-calendar-line me-1" />
                                {card.dueDate}
                              </span>
                            )}
                            {cardStatus && (
                              <span
                                className="badge"
                                style={{ backgroundColor: cardStatus.color, color: "#fff", fontSize: "0.65rem" }}
                              >
                                {cardStatus.name}
                              </span>
                            )}
                            {cardTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="badge"
                                style={{ backgroundColor: tag.color, color: "#fff", fontSize: "0.65rem" }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        );
                      })()}

                      <CardActionButtons key={`${card.id}:${card.boardColumnId}`} boardId={boardId} cardId={card.id} actions={actionsForCard(boardActions, actions, card.id)} canExecute={canExecuteActions} onDone={onActionDone} />

                      {(card.assigneeIds.length > 0 || card.commentCount > 0 || card.attachmentCount > 0) && (
                        <div className="d-flex align-items-center justify-content-between mt-2">
                          <div className="d-flex flex-wrap gap-1">
                            {card.assigneeIds.slice(0, 3).map((identityId) => {
                              const member = members.find((item) => item.identityId === identityId);
                              const label = member?.displayName ?? identityId.slice(0, 8);
                              return (
                                <span key={identityId} className="badge bg-primary-subtle text-primary" title={label}>
                                  {label}
                                </span>
                              );
                            })}
                            {card.assigneeIds.length > 3 && (
                              <span className="text-muted small ms-1">+{card.assigneeIds.length - 3}</span>
                            )}
                          </div>
                          <div className="d-flex gap-2 text-muted" style={{ fontSize: "0.72rem" }}>
                            {card.commentCount > 0 && (
                              <span>
                                <i className="ri-chat-3-line me-1" />
                                {card.commentCount}
                              </span>
                            )}
                            {card.attachmentCount > 0 && (
                              <span>
                                <i className="ri-attachment-2 me-1" />
                                {card.attachmentCount}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {canCreateCard && (
              <Button color="soft-primary" size="sm" className="w-100 mt-2" onClick={onOpenCreateCard}>
                <i className="ri-add-line me-1" />
                Novo card
              </Button>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
