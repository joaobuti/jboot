"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Nav, NavItem, NavLink, Spinner } from "reactstrap";
import { BoardDto, KanbanApiError, kanbanApi, OfficeListItemDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import LeadQueuePanel from "@/modules/kanban/components/leads/LeadQueuePanel";
import LeadSettingsPanel from "@/modules/kanban/components/leads/LeadSettingsPanel";
import CaseTypesPanel from "@/modules/kanban/components/leads/CaseTypesPanel";
import DocumentTemplatesPanel from "@/modules/kanban/components/leads/DocumentTemplatesPanel";

const TABS = [
  { id: "queue", label: "Fila", icon: "ri-inbox-archive-line" },
  { id: "caseTypes", label: "Tipos de caso", icon: "ri-price-tag-3-line" },
  { id: "templates", label: "Modelos", icon: "ri-file-word-line" },
  { id: "settings", label: "Configuração", icon: "ri-settings-3-line" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Leads do Flow (CRM de leads, Sprints 4 e 5): fila do gestor, tipos de caso,
 * modelos de documento e configuracao do envio (campos obrigatorios e captacao
 * por quadro). Somente `flow:admin`; o backend recusa os demais (403) e a tela
 * mostra o estado de permissao negada.
 */
export default function LeadsAdminPage() {
  const [tab, setTab] = useState<TabId>("queue");
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [offices, setOffices] = useState<OfficeListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReferences = useCallback(async () => {
    setError(null);
    try {
      const [boardsResult, officesResult] = await Promise.all([kanbanApi.boards.list(), kanbanApi.offices.list()]);
      setBoards(boardsResult.data.filter((board) => board.status === "active"));
      setOffices(officesResult.data);
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(describeKanbanError(err, "Erro ao carregar quadros e escritórios"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  const handleForbidden = useCallback(() => setForbidden(true), []);

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
        Somente o administrador do Flow acessa a fila de leads.
      </Alert>
    );
  }

  return (
    <div>
      <h4 className="mb-3">Leads</h4>
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
      {tab === "queue" && <LeadQueuePanel boards={boards} offices={offices} onForbidden={handleForbidden} />}
      {tab === "caseTypes" && <CaseTypesPanel onForbidden={handleForbidden} />}
      {tab === "templates" && <DocumentTemplatesPanel onForbidden={handleForbidden} />}
      {tab === "settings" && <LeadSettingsPanel boards={boards} onBoardsChanged={loadReferences} />}
    </div>
  );
}
