"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Spinner, Table } from "reactstrap";
import {
  CardStatusDto,
  CardTagDto,
  MemberProfileCapabilitiesDto,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";

interface TagsStatusSettingsProps {
  boardId: string;
}

const DEFAULT_COLOR = "#6c757d";

export default function TagsStatusSettings({ boardId }: TagsStatusSettingsProps) {
  const [capabilities, setCapabilities] = useState<MemberProfileCapabilitiesDto | null>(null);
  const [tags, setTags] = useState<CardTagDto[]>([]);
  const [statuses, setStatuses] = useState<CardStatusDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLOR);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState(DEFAULT_COLOR);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [board, tagsResult, statusesResult] = await Promise.all([
        kanbanApi.boards.get(boardId),
        kanbanApi.tags.list(boardId),
        kanbanApi.statuses.list(boardId),
      ]);
      setCapabilities(board.currentUserCapabilities ?? null);
      setTags(tagsResult.data);
      setStatuses(statusesResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tags e status");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManageTags = capabilities?.canManageTags ?? false;
  const canManageStatuses = capabilities?.canManageStatuses ?? false;

  async function handleCreateTag(event: React.FormEvent) {
    event.preventDefault();
    if (!newTagName.trim()) {
      return;
    }
    setError(null);
    try {
      await kanbanApi.tags.create(boardId, { name: newTagName.trim(), color: newTagColor });
      setNewTagName("");
      setNewTagColor(DEFAULT_COLOR);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tag");
    }
  }

  async function handleUpdateTagColor(tagId: string, color: string) {
    setError(null);
    try {
      await kanbanApi.tags.update(boardId, tagId, { color });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar tag");
    }
  }

  async function handleRemoveTag(tagId: string) {
    setError(null);
    try {
      await kanbanApi.tags.remove(boardId, tagId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover tag");
    }
  }

  async function handleCreateStatus(event: React.FormEvent) {
    event.preventDefault();
    if (!newStatusName.trim()) {
      return;
    }
    setError(null);
    try {
      await kanbanApi.statuses.create(boardId, { name: newStatusName.trim(), color: newStatusColor });
      setNewStatusName("");
      setNewStatusColor(DEFAULT_COLOR);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar status");
    }
  }

  async function handleUpdateStatusColor(statusId: string, color: string) {
    setError(null);
    try {
      await kanbanApi.statuses.update(boardId, statusId, { color });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar status");
    }
  }

  async function handleRemoveStatus(statusId: string) {
    setError(null);
    try {
      await kanbanApi.statuses.remove(boardId, statusId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover status");
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 className="mb-0">Tags e Status</h4>
        <Link href={`/flow/boards/${boardId}`} className="btn btn-light btn-sm">
          Voltar ao board
        </Link>
      </div>

      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card">
            <div className="card-body">
              <h6 className="card-title">Tags (multiplas por card)</h6>
              {!canManageTags && (
                <p className="text-muted small">Seu perfil nao tem permissao para gerenciar tags. Visualizacao apenas.</p>
              )}
              {canManageTags && (
                <form className="d-flex gap-2 mb-3" onSubmit={(e) => void handleCreateTag(e)}>
                  <Input
                    type="color"
                    style={{ width: 44, padding: 2 }}
                    value={newTagColor}
                    onChange={(event) => setNewTagColor(event.target.value)}
                  />
                  <Input
                    bsSize="sm"
                    placeholder="Nome da tag"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                  />
                  <Button color="primary" size="sm" type="submit" disabled={!newTagName.trim()}>
                    Criar
                  </Button>
                </form>
              )}

              {tags.length === 0 ? (
                <p className="text-muted small mb-0">Nenhuma tag criada ainda.</p>
              ) : (
                <Table size="sm" className="align-middle mb-0">
                  <tbody>
                    {tags.map((tag) => (
                      <tr key={tag.id}>
                        <td style={{ width: 36 }}>
                          {canManageTags ? (
                            <Input
                              type="color"
                              style={{ width: 28, height: 28, padding: 0 }}
                              value={tag.color}
                              onChange={(event) => void handleUpdateTagColor(tag.id, event.target.value)}
                            />
                          ) : (
                            <span
                              className="d-inline-block rounded-circle"
                              style={{ width: 16, height: 16, backgroundColor: tag.color }}
                            />
                          )}
                        </td>
                        <td>{tag.name}</td>
                        <td className="text-end">
                          {canManageTags && (
                            <Button color="link" size="sm" className="p-0 text-muted" onClick={() => void handleRemoveTag(tag.id)}>
                              <i className="ri-delete-bin-line" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card">
            <div className="card-body">
              <h6 className="card-title">Status (unico por card)</h6>
              {!canManageStatuses && (
                <p className="text-muted small">Seu perfil nao tem permissao para gerenciar status. Visualizacao apenas.</p>
              )}
              {canManageStatuses && (
                <form className="d-flex gap-2 mb-3" onSubmit={(e) => void handleCreateStatus(e)}>
                  <Input
                    type="color"
                    style={{ width: 44, padding: 2 }}
                    value={newStatusColor}
                    onChange={(event) => setNewStatusColor(event.target.value)}
                  />
                  <Input
                    bsSize="sm"
                    placeholder="Nome do status"
                    value={newStatusName}
                    onChange={(event) => setNewStatusName(event.target.value)}
                  />
                  <Button color="primary" size="sm" type="submit" disabled={!newStatusName.trim()}>
                    Criar
                  </Button>
                </form>
              )}

              {statuses.length === 0 ? (
                <p className="text-muted small mb-0">Nenhum status criado ainda.</p>
              ) : (
                <Table size="sm" className="align-middle mb-0">
                  <tbody>
                    {statuses.map((status) => (
                      <tr key={status.id}>
                        <td style={{ width: 36 }}>
                          {canManageStatuses ? (
                            <Input
                              type="color"
                              style={{ width: 28, height: 28, padding: 0 }}
                              value={status.color}
                              onChange={(event) => void handleUpdateStatusColor(status.id, event.target.value)}
                            />
                          ) : (
                            <span
                              className="d-inline-block rounded-circle"
                              style={{ width: 16, height: 16, backgroundColor: status.color }}
                            />
                          )}
                        </td>
                        <td>{status.name}</td>
                        <td className="text-end">
                          {canManageStatuses && (
                            <Button
                              color="link"
                              size="sm"
                              className="p-0 text-muted"
                              onClick={() => void handleRemoveStatus(status.id)}
                            >
                              <i className="ri-delete-bin-line" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
