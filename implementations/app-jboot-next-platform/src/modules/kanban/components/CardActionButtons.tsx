"use client";

import React, { useRef, useState } from "react";
import { Alert, Button, Spinner } from "reactstrap";
import { CardActionDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import PetitionMonitoringModal from "./PetitionMonitoringModal";

interface Props {
  boardId: string;
  cardId: string;
  actions: CardActionDto[];
  canExecute: boolean;
  /** Acao concluida com efeito no board (ex.: Monitorar criou card); recarrega acoes e cards. */
  onDone?: () => void;
}

export default function CardActionButtons({ boardId, cardId, actions, canExecute, onDone }: Props) {
  const busyRef = useRef(false);
  const [monitoringCardId, setMonitoringCardId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ color: string; message: string } | null>(null);

  async function execute(action: CardActionDto) {
    if (busyRef.current || !canExecute) return;
    // Acao de tela: Monitorar abre a escolha de peticoes e board (Sprint 2 de flow-card-actions).
    if (action.interaction === "dialog") {
      if (action.id === "monitorar") setMonitoringCardId(cardId);
      return;
    }
    busyRef.current = true;
    setPending(action.id);
    setFeedback(null);
    try {
      const result = await kanbanApi.actions.execute(boardId, cardId, action.id);
      setFeedback({ color: "success", message: result.message });
      // Acao por card (ex.: Validar assinatura) pode deixar de valer para o card: recarrega a disponibilidade.
      if (action.perCardAvailability) onDone?.();
    } catch (error) {
      setFeedback({ color: "danger", message: describeKanbanError(error, "Erro ao executar ação") });
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  }

  // Depois do envio a acao some do card (nada mais a enviar); o modal ou o aviso do resultado seguem visiveis.
  if (actions.length === 0 && monitoringCardId === null && feedback === null) return null;
  return (
    <div className="mt-2" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <div className="d-flex flex-wrap gap-1">
        {actions.map(action => (
          <Button key={action.id} type="button" color="soft-info" size="sm"
            disabled={!canExecute || pending !== null}
            title={canExecute ? action.description : "Permissão Executar ações necessária"}
            onClick={() => void execute(action)}>
            {pending === action.id ? <Spinner size="sm" className="me-1" /> : <i className={`${action.icon} me-1`} />}
            {action.label}
          </Button>
        ))}
      </div>
      {feedback && <Alert color={feedback.color} className="small mb-0 mt-2 py-2" aria-live="polite">{feedback.message}</Alert>}
      <PetitionMonitoringModal cardId={monitoringCardId} onClose={() => setMonitoringCardId(null)} onSent={() => onDone?.()} />
    </div>
  );
}
