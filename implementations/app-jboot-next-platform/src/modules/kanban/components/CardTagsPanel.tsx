"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Spinner } from "reactstrap";
import { CardTagDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

interface CardTagsPanelProps {
  boardId: string;
  cardId: string;
  onChanged?: () => void;
}

export default function CardTagsPanel({ boardId, cardId, onChanged }: CardTagsPanelProps) {
  const [allTags, setAllTags] = useState<CardTagDto[]>([]);
  const [cardTags, setCardTags] = useState<CardTagDto[]>([]);
  const [canManageTags, setCanManageTags] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTagId, setNewTagId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [board, tagsResult, cardTagsResult] = await Promise.all([
        kanbanApi.boards.get(boardId),
        kanbanApi.tags.list(boardId),
        kanbanApi.tags.listForCard(boardId, cardId),
      ]);
      setCanManageTags(board.currentUserRole === "board_admin" || (board.currentUserCapabilities?.canManageTags ?? false));
      setAllTags(tagsResult.data);
      setCardTags(cardTagsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tags do card");
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggleTag(tagId: string, attached: boolean) {
    setError(null);
    try {
      if (attached) {
        await kanbanApi.tags.detachFromCard(boardId, cardId, tagId);
      } else {
        await kanbanApi.tags.attachToCard(boardId, cardId, tagId);
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar tags do card");
    }
  }

  if (loading) {
    return (
      <div className="text-center py-2">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <Alert color="danger" toggle={() => setError(null)} className="py-2">
          {error}
        </Alert>
      )}
      <h6 className="text-muted mb-2">Tags</h6>
      <div className="d-flex flex-wrap gap-2 mb-2">
        {cardTags.length === 0 && <span className="text-muted small">Nenhuma tag atribuida.</span>}
        {cardTags.map((tag) => (
          <span
            key={tag.id}
            className="badge d-inline-flex align-items-center gap-1"
            style={{ backgroundColor: tag.color, color: "#fff" }}
          >
            {tag.name}
            {canManageTags && (
              <Button
                color="link"
                className="p-0"
                style={{ lineHeight: 1, color: "#fff" }}
                onClick={() => void handleToggleTag(tag.id, true)}
                title="Remover tag"
              >
                <i className="ri-close-line" />
              </Button>
            )}
          </span>
        ))}
      </div>
      {canManageTags &&
        (() => {
          const availableTags = allTags.filter((tag) => !cardTags.some((cardTag) => cardTag.id === tag.id));
          if (availableTags.length === 0) {
            return null;
          }
          return (
            <div className="d-flex gap-2">
              <Input bsSize="sm" type="select" value={newTagId} onChange={(event) => setNewTagId(event.target.value)}>
                <option value="">Adicionar tag...</option>
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </Input>
              <Button
                color="soft-primary"
                size="sm"
                disabled={!newTagId}
                onClick={() => {
                  void handleToggleTag(newTagId, false);
                  setNewTagId("");
                }}
              >
                Adicionar
              </Button>
            </div>
          );
        })()}
    </div>
  );
}
