"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Nav, NavItem, NavLink, Spinner } from "reactstrap";
import {
  KanbanApiError,
  kanbanApi,
  OfficeListItemDto,
  OfficeSettingsDto,
  OfficeUserDto,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import OfficeActivationPanel from "@/modules/kanban/components/offices/OfficeActivationPanel";
import OfficesListPanel from "@/modules/kanban/components/offices/OfficesListPanel";
import OfficeUsersPanel from "@/modules/kanban/components/offices/OfficeUsersPanel";
import OfficeServiceContractPanel from "@/modules/kanban/components/offices/OfficeServiceContractPanel";

const TABS = [
  { id: "offices", label: "Escritorios", icon: "ri-building-line" },
  { id: "users", label: "Usuarios", icon: "ri-shield-user-line" },
  { id: "activation", label: "Ativacao", icon: "ri-eye-line" },
  { id: "service-contract", label: "Contrato Serviços", icon: "ri-file-text-line" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Administracao de escritorios do Flow (CRM de leads, Sprint 3.5). Somente `flow:admin`; o
 * backend recusa os demais (403) e a tela mostra o estado de permissao negada.
 */
export default function OfficesAdminPage() {
  const [tab, setTab] = useState<TabId>("offices");
  const [offices, setOffices] = useState<OfficeListItemDto[]>([]);
  const [users, setUsers] = useState<OfficeUserDto[]>([]);
  const [settings, setSettings] = useState<OfficeSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [officesResult, usersResult, settingsResult] = await Promise.all([
        kanbanApi.offices.list(),
        kanbanApi.offices.users(),
        kanbanApi.offices.settings(),
      ]);
      setOffices(officesResult.data);
      setUsers(usersResult.data);
      setSettings(settingsResult);
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(describeKanbanError(err, "Erro ao carregar escritorios"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner color="primary" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <Alert color="warning">
        <i className="ri-lock-line me-2" />
        Somente o administrador do Flow cadastra escritorios e vincula usuarios.
      </Alert>
    );
  }

  return (
    <div>
      <h4 className="mb-3">Escritorios</h4>
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Nav tabs className="nav-tabs-custom mb-3">
        {TABS.map((item) => (
          <NavItem key={item.id}>
            <NavLink
              href="#"
              className={tab === item.id ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                setTab(item.id);
              }}
            >
              <i className={`${item.icon} me-1`} />
              {item.label}
            </NavLink>
          </NavItem>
        ))}
      </Nav>
      {tab === "offices" && <OfficesListPanel offices={offices} onChanged={load} />}
      {tab === "users" && <OfficeUsersPanel users={users} offices={offices} onChanged={load} />}
      {tab === "activation" && settings && <OfficeActivationPanel settings={settings} offices={offices} onChanged={load} />}
      {tab === "service-contract" && <OfficeServiceContractPanel offices={offices} />}
    </div>
  );
}
