"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Row,
  Spinner,
  Table
} from "reactstrap";
import {
  listManagedUsers,
  ManagedUser,
  ModulePermissionCatalog,
  getModulePermissionCatalog,
  revokeManagedUser,
  updateManagedUserStatus
} from "@/lib/identity-manager-api";
import { pdvApi, PdvStockLocation } from "@/modules/pdv/lib/pdv-api";
import { FlowUserManagementContextDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import FlowUserLawyerModal from "@/modules/kanban/components/users/FlowUserLawyerModal";
import { UserFormModal } from "./UserFormModal";
import { PermissionModal } from "./PermissionModal";
import Cookies from "js-cookie";

const STATUS_COLOR: Record<string, string> = {
  active: "success",
  suspended: "warning",
  revoked: "danger"
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  revoked: "Revogado"
};

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getPdvActorInfo(): { roles: string[]; locationId?: string } {
  const token = Cookies.get("pdvAccessToken");
  if (!token) return { roles: [] };
  const p = decodeTokenPayload(token);
  return {
    roles: Array.isArray(p?.roles) ? p.roles.map(String) : [],
    locationId: typeof p?.location_id === "string" ? p.location_id : undefined
  };
}

function isPdvModule(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/pdv");
}

export function ModuleUserManager() {
  const flowModule = typeof window !== "undefined" && window.location.pathname.startsWith("/flow");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<ModulePermissionCatalog>({ scopes: [], roles: [] });
  const [permissionUser, setPermissionUser] = useState<ManagedUser | null>(null);

  // PDV-specific state
  const [pdvStores, setPdvStores] = useState<PdvStockLocation[]>([]);
  const [pdvActor, setPdvActor] = useState<{ roles: string[]; locationId?: string }>({ roles: [] });
  const [flowContext, setFlowContext] = useState<FlowUserManagementContextDto | undefined>();
  // Flow: OABs por usuario (quem assina a peticao, S7 de docs/product/flow-initial-petitions-sprints.md).
  const [lawyerUfs, setLawyerUfs] = useState<Map<string, string[]> | null>(null);
  const [lawyerUser, setLawyerUser] = useState<ManagedUser | null>(null);

  const refreshLawyers = useCallback(() => {
    kanbanApi.offices
      .userLawyers()
      .then((result) => setLawyerUfs(new Map(result.data.map((row) => [row.identityId, row.ufs]))))
      .catch(() => setLawyerUfs(null));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [managedUsers, catalog] = await Promise.all([listManagedUsers(), getModulePermissionCatalog()]);
      setUsers(managedUsers);
      setPermissionCatalog(catalog);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    if (isPdvModule()) {
      setPdvActor(getPdvActorInfo());
      pdvApi.stockLocations
        .list()
        .then((r) => setPdvStores(r.data.filter((s) => s.status === "active")))
        .catch(() => setPdvStores([]));
    } else if (flowModule) {
      kanbanApi.offices.userManagementContext()
        .then(setFlowContext)
        .catch(err => setError(err instanceof Error ? err.message : "Erro ao carregar escritórios"));
      refreshLawyers();
    }
  }, [refresh, refreshLawyers]);

  async function handleToggleStatus(user: ManagedUser) {
    setActionLoading(user.identityId);
    try {
      const next = user.entitlementStatus === "active" ? "suspended" : "active";
      await updateManagedUserStatus(user.identityId, next);
      await refresh();
    } catch {
      setError("Erro ao atualizar status do usuário");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevoke(user: ManagedUser) {
    if (!confirm(`Revogar acesso de "${user.displayName}"?`)) return;
    setActionLoading(user.identityId);
    try {
      await revokeManagedUser(user.identityId);
      await refresh();
    } catch {
      setError("Erro ao revogar acesso");
    } finally {
      setActionLoading(null);
    }
  }

  const isAdmin = pdvActor.roles.includes("admin");

  return (
    <>
      <Row>
        <Col xs={12}>
          <Card>
            <CardHeader className="d-flex align-items-center justify-content-between">
              <h5 className="mb-0">Usuários do Módulo</h5>
              <Button color="primary" size="sm" onClick={() => setModalOpen(true)} disabled={flowModule && !flowContext}>
                <i className="ri-user-add-line me-1" />
                Novo Usuário
              </Button>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}

              {loading ? (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                </div>
              ) : users.length === 0 ? (
                <p className="text-muted text-center py-4 mb-0">
                  Nenhum usuário cadastrado neste módulo.
                </p>
              ) : (
                <div className="table-responsive">
                  <Table className="table-nowrap mb-0" hover>
                    <thead className="table-light">
                      <tr>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th>E-mail</th>
                        <th>Status</th>
                        {lawyerUfs && <th>OAB</th>}
                        <th>Desde</th>
                        <th className="text-end">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.identityId}>
                          <td>{user.displayName}</td>
                          <td className="text-uppercase">{user.documentType}</td>
                          <td>{user.email ?? "—"}</td>
                          <td>
                            <Badge color={STATUS_COLOR[user.entitlementStatus] ?? "secondary"}>
                              {STATUS_LABEL[user.entitlementStatus] ?? user.entitlementStatus}
                            </Badge>
                          </td>
                          {lawyerUfs && <td>{lawyerUfs.get(user.identityId)?.join(", ") ?? "—"}</td>}
                          <td>{new Date(user.grantedAt).toLocaleDateString("pt-BR")}</td>
                          <td className="text-end">
                            {actionLoading === user.identityId ? (
                              <Spinner size="sm" />
                            ) : user.entitlementStatus !== "revoked" ? (
                              <>
                                <Button size="sm" color="primary" outline className="me-1" onClick={() => setPermissionUser(user)}>
                                  Permissões
                                </Button>
                                {lawyerUfs && (
                                  <Button size="sm" color="primary" outline className="me-1" onClick={() => setLawyerUser(user)}>
                                    Advogado
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  color={user.entitlementStatus === "active" ? "warning" : "success"}
                                  outline
                                  className="me-1"
                                  onClick={() => handleToggleStatus(user)}
                                >
                                  {user.entitlementStatus === "active" ? "Suspender" : "Reativar"}
                                </Button>
                                <Button
                                  size="sm"
                                  color="danger"
                                  outline
                                  onClick={() => handleRevoke(user)}
                                >
                                  Revogar
                                </Button>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <UserFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); void refresh(); }}
        pdvStores={isPdvModule() ? pdvStores : undefined}
        isAdmin={isAdmin}
        creatorLocationId={pdvActor.locationId}
        flowContext={flowContext}
        flowMode={flowModule}
      />
      <PermissionModal
        catalog={permissionCatalog}
        user={permissionUser}
        onClose={() => setPermissionUser(null)}
        onSaved={() => { setPermissionUser(null); void refresh(); }}
      />
      {flowModule && (
        <FlowUserLawyerModal
          user={lawyerUser}
          onClose={() => setLawyerUser(null)}
          onSaved={() => { setLawyerUser(null); refreshLawyers(); }}
        />
      )}
    </>
  );
}
