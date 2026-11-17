"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Spinner } from "reactstrap";
import { AssigneeCandidateDto, CardAssigneeDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

interface CardAssigneesPanelProps {
  boardId: string;
  cardId: string;
  onChanged?: () => void;
  readOnly?: boolean;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function CardAssigneesPanel({ boardId, cardId, onChanged, readOnly = false }: CardAssigneesPanelProps) {
  // Sprint 3.5: candidatos = membros ativos que veem o card (escritorio do card ou administrador).
  const [members, setMembers] = useState<AssigneeCandidateDto[]>([]);
  const [assignees, setAssignees] = useState<CardAssigneeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candidatesResult, assigneesResult] = await Promise.all([
        kanbanApi.assignees.candidates(boardId, cardId),
        kanbanApi.assignees.list(boardId, cardId),
      ]);
      setMembers(candidatesResult);
      setAssignees(assigneesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar responsaveis");
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignableMembers = members.filter(
    (member) => !assignees.some((assignee) => assignee.identityId === member.identityId)
  );

  async function handleAddAssignee() {
    if (!newAssigneeId) {
      return;
    }
    setError(null);
    try {
      await kanbanApi.assignees.create(boardId, cardId, newAssigneeId);
      setNewAssigneeId("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao atribuir responsavel"));
    }
  }

  async function handleRemoveAssignee(identityId: string) {
    setError(null);
    try {
      await kanbanApi.assignees.remove(boardId, cardId, identityId);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover responsavel");
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
      <h6 className="text-muted mb-2">Responsaveis</h6>
      <div className="d-flex flex-wrap gap-2 mb-2">
        {assignees.length === 0 && <span className="text-muted small">Nenhum responsavel atribuido.</span>}
        {assignees.map((assignee) => {
          const member = members.find((item) => item.identityId === assignee.identityId);
          return (
            <Badge key={assignee.id} color="soft-primary" className="d-inline-flex align-items-center gap-1 p-2">
              {member?.displayName ?? shortId(assignee.identityId)}
              {!readOnly && (
                <Button
                  color="link"
                  className="p-0 text-muted"
                  style={{ lineHeight: 1 }}
                  onClick={() => void handleRemoveAssignee(assignee.identityId)}
                  title="Remover responsavel"
                >
                  <i className="ri-close-line" />
                </Button>
              )}
            </Badge>
          );
        })}
      </div>
      {!readOnly && assignableMembers.length > 0 && (
        <div className="d-flex gap-2">
          <Input bsSize="sm" type="select" value={newAssigneeId} onChange={(event) => setNewAssigneeId(event.target.value)}>
            <option value="">Atribuir membro...</option>
            {assignableMembers.map((member) => (
              <option key={member.identityId} value={member.identityId}>
                {member.displayName ?? shortId(member.identityId)} ({member.role})
              </option>
            ))}
          </Input>
          <Button color="soft-primary" size="sm" onClick={() => void handleAddAssignee()} disabled={!newAssigneeId}>
            Atribuir
          </Button>
        </div>
      )}
    </div>
  );
}
