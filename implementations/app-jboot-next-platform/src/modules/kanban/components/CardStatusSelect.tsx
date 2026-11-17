"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Input, Spinner } from "reactstrap";
import { CardStatusDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

interface CardStatusSelectProps {
  boardId: string;
  cardId: string;
  initialCardStatusId: string | null;
  onChanged?: () => void;
}

export default function CardStatusSelect({ boardId, cardId, initialCardStatusId, onChanged }: CardStatusSelectProps) {
  const [allStatuses, setAllStatuses] = useState<CardStatusDto[]>([]);
  const [cardStatusId, setCardStatusId] = useState<string | null>(initialCardStatusId);
  const [canManageStatuses, setCanManageStatuses] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [board, statusesResult] = await Promise.all([kanbanApi.boards.get(boardId), kanbanApi.statuses.list(boardId)]);
      setCanManageStatuses(
        board.currentUserRole === "board_admin" || (board.currentUserCapabilities?.canManageStatuses ?? false)
      );
      setAllStatuses(statusesResult.data);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleChangeStatus(nextStatusId: string) {
    setCardStatusId(nextStatusId || null);
    try {
      await kanbanApi.cards.setStatus(boardId, cardId, nextStatusId || null);
      onChanged?.();
    } catch {
      setCardStatusId(initialCardStatusId);
    }
  }

  if (loading) {
    return <Spinner size="sm" />;
  }

  if (!canManageStatuses) {
    return (
      <span className="text-muted small">{allStatuses.find((status) => status.id === cardStatusId)?.name ?? "Sem status"}</span>
    );
  }

  return (
    <Input bsSize="sm" type="select" value={cardStatusId ?? ""} onChange={(event) => void handleChangeStatus(event.target.value)}>
      <option value="">Sem status</option>
      {allStatuses.map((status) => (
        <option key={status.id} value={status.id}>
          {status.name}
        </option>
      ))}
    </Input>
  );
}
