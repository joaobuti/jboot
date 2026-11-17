"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Spinner, Table } from "reactstrap";
import {
  BoardColumnDto,
  BoardMemberDto,
  BoardMemberRole,
  IdentityCandidateDto,
  MemberProfileDto,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";

interface ProfilesSettingsProps {
  boardId: string;
}

export default function ProfilesSettings({ boardId }: ProfilesSettingsProps) {
  const [columns, setColumns] = useState<BoardColumnDto[]>([]);
  const [profiles, setProfiles] = useState<MemberProfileDto[]>([]);
  const [members, setMembers] = useState<BoardMemberDto[]>([]);
  const [candidates, setCandidates] = useState<IdentityCandidateDto[]>([]);
  const [newMemberIdentityId, setNewMemberIdentityId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<BoardMemberRole>("board_member");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [transitions, setTransitions] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<Map<string, { canView: boolean; canEdit: boolean }>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  const loadBoardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [columnsResult, profilesResult, membersResult, candidatesResult] = await Promise.all([
        kanbanApi.columns.list(boardId),
        kanbanApi.profiles.list(boardId),
        kanbanApi.members.list(boardId),
        kanbanApi.members.candidates(boardId),
      ]);
      setColumns(columnsResult.data.sort((a, b) => a.position - b.position));
      setProfiles(profilesResult.data);
      setMembers(membersResult.data);
      setCandidates(candidatesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar perfis");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void loadBoardData();
  }, [loadBoardData]);

  const loadProfileRules = useCallback(async (profileId: string) => {
    const [transitionsResult, permissionsResult] = await Promise.all([
      kanbanApi.profiles.listTransitions(boardId, profileId),
      kanbanApi.profiles.listColumnPermissions(boardId, profileId),
    ]);
    setTransitions(new Set(transitionsResult.map((t) => `${t.fromBoardColumnId}:${t.toBoardColumnId}`)));
    setPermissions(
      new Map(permissionsResult.map((p) => [p.boardColumnId, { canView: p.canView, canEdit: p.canEdit }]))
    );
  }, [boardId]);

  useEffect(() => {
    if (selectedProfileId) {
      void loadProfileRules(selectedProfileId);
    } else {
      setTransitions(new Set());
      setPermissions(new Map());
    }
  }, [selectedProfileId, loadProfileRules]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  async function handleCreateProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!newProfileName.trim()) {
      return;
    }
    setError(null);
    try {
      const created = await kanbanApi.profiles.create(boardId, { name: newProfileName.trim() });
      setNewProfileName("");
      await loadBoardData();
      setSelectedProfileId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar perfil");
    }
  }

  async function handleRemoveProfile(profileId: string) {
    setError(null);
    try {
      await kanbanApi.profiles.remove(boardId, profileId);
      if (selectedProfileId === profileId) {
        setSelectedProfileId(null);
      }
      await loadBoardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover perfil");
    }
  }

  async function handleToggleCapability(
    profileId: string,
    field: "canDeleteArchivedCards" | "canManageTags" | "canManageStatuses" | "canReviewDocuments",
    value: boolean
  ) {
    setError(null);
    try {
      await kanbanApi.profiles.update(boardId, profileId, { [field]: value });
      await loadBoardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar perfil");
    }
  }

  function toggleTransition(fromId: string, toId: string) {
    const key = `${fromId}:${toId}`;
    setTransitions((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function updatePermission(columnId: string, field: "canView" | "canEdit", value: boolean) {
    setPermissions((previous) => {
      const next = new Map(previous);
      const current = next.get(columnId) ?? { canView: true, canEdit: true };
      const updated = { ...current, [field]: value };
      if (field === "canView" && !value) {
        updated.canEdit = false;
      }
      next.set(columnId, updated);
      return next;
    });
  }

  async function handleSaveRules() {
    if (!selectedProfileId) {
      return;
    }
    setSavingRules(true);
    setError(null);
    try {
      const transitionPairs = Array.from(transitions).map((key) => {
        const [fromBoardColumnId, toBoardColumnId] = key.split(":");
        return { fromBoardColumnId, toBoardColumnId };
      });
      const permissionEntries = columns.map((column) => {
        const access = permissions.get(column.id) ?? { canView: true, canEdit: true };
        return { boardColumnId: column.id, canView: access.canView, canEdit: access.canEdit };
      });
      await Promise.all([
        kanbanApi.profiles.replaceTransitions(boardId, selectedProfileId, transitionPairs),
        kanbanApi.profiles.replaceColumnPermissions(boardId, selectedProfileId, permissionEntries),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar regras do perfil");
    } finally {
      setSavingRules(false);
    }
  }

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    if (!newMemberIdentityId) {
      return;
    }
    setError(null);
    try {
      await kanbanApi.members.create(boardId, { identityId: newMemberIdentityId, role: newMemberRole });
      setNewMemberIdentityId("");
      setNewMemberRole("board_member");
      await loadBoardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar membro");
    }
  }

  async function handleAssignProfile(memberId: string, profileId: string) {
    setError(null);
    try {
      await kanbanApi.members.assignProfile(boardId, memberId, profileId || null);
      await loadBoardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atribuir perfil");
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
        <h4 className="mb-0">Perfis de movimentacao</h4>
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
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-title">Perfis do board</h6>
              <form className="d-flex gap-2 mb-3" onSubmit={(e) => void handleCreateProfile(e)}>
                <Input
                  bsSize="sm"
                  placeholder="Nome do perfil"
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                />
                <Button color="primary" size="sm" type="submit" disabled={!newProfileName.trim()}>
                  Criar
                </Button>
              </form>

              {profiles.length === 0 ? (
                <p className="text-muted small mb-0">Nenhum perfil criado ainda.</p>
              ) : (
                <ul className="list-group">
                  {profiles.map((profile) => (
                    <li
                      key={profile.id}
                      className={`list-group-item d-flex justify-content-between align-items-center ${
                        selectedProfileId === profile.id ? "active" : ""
                      }`}
                      role="button"
                      onClick={() => setSelectedProfileId(profile.id)}
                    >
                      <span>{profile.name}</span>
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 text-muted"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRemoveProfile(profile.id);
                        }}
                        title="Remover perfil"
                      >
                        <i className="ri-delete-bin-line" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card mt-3">
            <div className="card-body">
              <h6 className="card-title">Membros do board</h6>

              {candidates.length === 0 ? (
                <p className="text-muted small">
                  Nenhuma identidade com acesso ao Flow disponivel para adicionar (todas que tem entitlement ja sao
                  membros, ou nenhuma outra identidade do tenant tem acesso ao modulo ainda).
                </p>
              ) : (
                <form className="d-flex gap-2 mb-3" onSubmit={(e) => void handleAddMember(e)}>
                  <Input
                    bsSize="sm"
                    type="select"
                    value={newMemberIdentityId}
                    onChange={(event) => setNewMemberIdentityId(event.target.value)}
                  >
                    <option value="">Adicionar membro...</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.identityId} value={candidate.identityId}>
                        {candidate.displayName ?? candidate.identityId.slice(0, 8)}
                      </option>
                    ))}
                  </Input>
                  <Input
                    bsSize="sm"
                    type="select"
                    style={{ maxWidth: 140 }}
                    value={newMemberRole}
                    onChange={(event) => setNewMemberRole(event.target.value as BoardMemberRole)}
                  >
                    <option value="board_member">Membro</option>
                    <option value="board_admin">Admin</option>
                    <option value="board_viewer">Visualizador</option>
                  </Input>
                  <Button color="primary" size="sm" type="submit" disabled={!newMemberIdentityId}>
                    Adicionar
                  </Button>
                </form>
              )}

              {members.length === 0 ? (
                <p className="text-muted small mb-0">Nenhum membro ainda.</p>
              ) : (
                <Table size="sm" className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Membro</th>
                      <th>Papel</th>
                      <th>Perfil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td className="text-truncate" style={{ maxWidth: 140 }} title={member.identityId}>
                          {member.displayName ?? member.identityId.slice(0, 8)}
                        </td>
                        <td>{member.role}</td>
                        <td>
                          <Input
                            bsSize="sm"
                            type="select"
                            value={member.profileId ?? ""}
                            onChange={(event) => void handleAssignProfile(member.id, event.target.value)}
                          >
                            <option value="">Sem perfil</option>
                            {profiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name}
                              </option>
                            ))}
                          </Input>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          {!selectedProfile ? (
            <div className="card">
              <div className="card-body text-muted">Selecione um perfil para configurar transicoes e ACL de coluna.</div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h6 className="card-title mb-0">Regras de &quot;{selectedProfile.name}&quot;</h6>
                  <Button color="primary" size="sm" onClick={() => void handleSaveRules()} disabled={savingRules}>
                    {savingRules ? <Spinner size="sm" className="me-1" /> : null}
                    Salvar regras
                  </Button>
                </div>

                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="can-delete-archived"
                    checked={selectedProfile.canDeleteArchivedCards}
                    onChange={(event) =>
                      void handleToggleCapability(selectedProfile.id, "canDeleteArchivedCards", event.target.checked)
                    }
                  />
                  <label className="form-check-label" htmlFor="can-delete-archived">
                    Pode excluir cards arquivados
                  </label>
                </div>

                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="can-manage-tags"
                    checked={selectedProfile.canManageTags}
                    onChange={(event) => void handleToggleCapability(selectedProfile.id, "canManageTags", event.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="can-manage-tags">
                    Pode gerenciar tags (cadastro, edicao e aplicar/remover no card)
                  </label>
                </div>

                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="can-manage-statuses"
                    checked={selectedProfile.canManageStatuses}
                    onChange={(event) =>
                      void handleToggleCapability(selectedProfile.id, "canManageStatuses", event.target.checked)
                    }
                  />
                  <label className="form-check-label" htmlFor="can-manage-statuses">
                    Pode gerenciar status (cadastro, edicao e definir no card)
                  </label>
                </div>

                <div className="form-check form-switch mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="can-review-documents"
                    checked={selectedProfile.canReviewDocuments}
                    onChange={(event) =>
                      void handleToggleCapability(selectedProfile.id, "canReviewDocuments", event.target.checked)
                    }
                  />
                  <label className="form-check-label" htmlFor="can-review-documents">
                    Pode revisar documentos do checklist (aceitar/rejeitar)
                  </label>
                </div>

                <h6 className="text-muted">Transicoes permitidas (origem na linha, destino na coluna)</h6>
                <div className="table-responsive mb-4">
                  <Table size="sm" bordered className="text-center align-middle">
                    <thead>
                      <tr>
                        <th>De \ Para</th>
                        {columns.map((column) => (
                          <th key={column.id}>{column.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((fromColumn) => (
                        <tr key={fromColumn.id}>
                          <th className="text-start">{fromColumn.name}</th>
                          {columns.map((toColumn) => (
                            <td key={toColumn.id}>
                              {fromColumn.id === toColumn.id ? (
                                <span className="text-muted">—</span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={transitions.has(`${fromColumn.id}:${toColumn.id}`)}
                                  onChange={() => toggleTransition(fromColumn.id, toColumn.id)}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <h6 className="text-muted">ACL por coluna</h6>
                <Table size="sm" className="align-middle">
                  <thead>
                    <tr>
                      <th>Coluna</th>
                      <th>Ver</th>
                      <th>Editar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((column) => {
                      const access = permissions.get(column.id) ?? { canView: true, canEdit: true };
                      return (
                        <tr key={column.id}>
                          <td>{column.name}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={access.canView}
                              onChange={(event) => updatePermission(column.id, "canView", event.target.checked)}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={access.canEdit}
                              disabled={!access.canView}
                              onChange={(event) => updatePermission(column.id, "canEdit", event.target.checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
