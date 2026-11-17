"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner, Table } from "reactstrap";
import { AiAgent, aiGatewayApi } from "@/lib/ai-gateway-api";
import { BoardActionsDto, CardActionDto, ColumnActionConfigInput, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { actionsForColumn } from "@/modules/kanban/lib/card-actions";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { routineAgents } from "@/modules/kanban/components/customers/CustomerValidationSettingsPage";

/**
 * Agente salvo de cada acao com `config` na coluna, quando quem configurou e a conta atual (o select so lista os
 * agentes da propria conta; salvar com outro agente torna a conta atual a executora).
 */
export function columnAgentDrafts(context: BoardActionsDto | null, columnId: string): Record<string, string> {
  if (!context) return {};
  return Object.fromEntries(context.assignments
    .filter(item => item.columnId === columnId && item.agentId && item.configuredByCurrentUser)
    .map(item => [item.actionId, item.agentId as string]));
}

/** Configs a enviar: so das acoes marcadas que exigem agente. Devolve a primeira acao sem agente, se houver. */
export function columnActionConfigs(
  actions: CardActionDto[], selected: string[], drafts: Record<string, string>
): { configs: ColumnActionConfigInput[]; missing: CardActionDto | null } {
  const needing = actions.filter(action => action.config === "routine_agent" && selected.includes(action.id));
  const missing = needing.find(action => !drafts[action.id]) ?? null;
  return { configs: needing.filter(action => drafts[action.id]).map(action => ({ actionId: action.id, agentId: drafts[action.id] })), missing };
}

export default function BoardActionsSettings({ boardId }: { boardId: string }) {
  const [context, setContext] = useState<BoardActionsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [columnId, setColumnId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentDrafts, setAgentDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setContext(await kanbanApi.actions.list(boardId)); }
    catch (reason) { setError(describeKanbanError(reason, "Erro ao carregar ações")); }
    finally { setLoading(false); }
  }, [boardId]);

  useEffect(() => { void load(); }, [load]);

  // Agentes de rotina da conta de quem configura: so carrega para quem pode configurar.
  useEffect(() => {
    if (!context?.canConfigure) return;
    aiGatewayApi.agents.list()
      .then(list => { setAgents(routineAgents(list)); setAgentsError(null); })
      .catch(() => setAgentsError("Não foi possível carregar os agentes de IA desta conta."));
  }, [context?.canConfigure]);

  function edit(id: string) {
    setColumnId(id);
    setSelected(actionsForColumn(context, id).map(action => action.id));
    setAgentDrafts(columnAgentDrafts(context, id));
    setCategoryId("");
    setSaveError(null);
    setSuccess(null);
  }

  async function save() {
    if (!columnId || saving) return;
    const { configs, missing } = columnActionConfigs(context?.actions ?? [], selected, agentDrafts);
    if (missing) {
      setSaveError(`Escolha o agente de IA da ação "${missing.label}".`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await kanbanApi.actions.replace(boardId, columnId, selected, configs);
      setContext(await kanbanApi.actions.list(boardId));
      setColumnId(null);
      setSuccess("Ações da coluna salvas.");
    } catch (reason) { setSaveError(describeKanbanError(reason, "Erro ao salvar ações")); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 className="mb-0">Ações</h4>
        <Link href={`/flow/boards/${boardId}`} className="btn btn-light btn-sm"><i className="ri-arrow-left-line me-1" />Voltar ao board</Link>
      </div>
      {error && <Alert color="danger">{error} <Button color="link" size="sm" onClick={() => void load()}>Tentar novamente</Button></Alert>}
      {success && <Alert color="success" toggle={() => setSuccess(null)}>{success}</Alert>}
      {loading ? <div className="text-center py-4"><Spinner size="sm" /> Carregando ações...</div>
        : context && !context.canConfigure ? <Alert color="warning">Somente o administrador Senior ou o master do cliente pode configurar ações.</Alert>
        : context && <Card>
          <CardHeader><h5 className="card-title mb-0">Ações por coluna</h5></CardHeader>
          <CardBody>
            <p className="text-muted small">Os cards exibem as ações atribuídas à coluna atual. A execução depende da permissão Executar ações.</p>
            {context.columns.length === 0 ? <Alert color="info">Nenhuma coluna ativa no board.</Alert> :
              <div className="table-responsive"><Table hover className="table-nowrap align-middle mb-0">
                <thead className="table-light"><tr><th>Coluna</th><th>Ações</th><th className="text-end">Configurar</th></tr></thead>
                <tbody>{context.columns.map(column => {
                  const actions = actionsForColumn(context, column.id);
                  return <tr key={column.id}><td>{column.name}</td><td>
                    {actions.length ? actions.map(action => {
                      const agentId = context.assignments.find(item => item.columnId === column.id && item.actionId === action.id)?.agentId;
                      const agentName = agentId ? agents.find(agent => agent.id === agentId)?.name ?? "agente de outra conta" : null;
                      return <Badge key={action.id} color="info" className="me-1" title={action.description}>{action.label}{agentName ? ` · ${agentName}` : ""}</Badge>;
                    }) : <span className="text-muted">Nenhuma ação</span>}
                  </td><td className="text-end"><Button color="light" size="sm" onClick={() => edit(column.id)}><i className="ri-pencil-line me-1" />Editar</Button></td></tr>;
                })}</tbody>
              </Table></div>}
          </CardBody>
        </Card>}
      <Modal isOpen={columnId !== null} toggle={() => { if (!saving) setColumnId(null); }} centered size="xl" backdrop="static">
        <ModalHeader toggle={saving ? undefined : () => setColumnId(null)}>Editar ações — {context?.columns.find(column => column.id === columnId)?.name}</ModalHeader>
        <ModalBody>
          {saveError && <Alert color="danger">{saveError}</Alert>}
          <Row className="g-4"><Col lg={3}>
            <div className="nav flex-lg-column nav-pills"><button type="button" className="nav-link text-start active"><i className="ri-flashlight-line me-2" />Ações</button></div>
          </Col><Col lg={9}>
            <Label for="action-category">Categoria</Label>
            <Input id="action-category" type="select" value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={saving}>
              <option value="">Todas as categorias</option>
              {context?.categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
            </Input>
            {context?.categories.filter(category => !categoryId || category.id === categoryId).map(category => (
              <section key={category.id} className="mt-3">
                <h6 className="text-uppercase border-bottom pb-2">{category.label}</h6>
                {context.actions.filter(action => action.boardSelectable && action.category === category.id).map(action => (
                  <div key={action.id} className="form-check mb-3">
                    <Input id={`card-action-${action.id}`} type="checkbox" checked={selected.includes(action.id)} disabled={saving}
                      onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, action.id])] : current.filter(id => id !== action.id))} />
                    <Label check for={`card-action-${action.id}`}><i className={`${action.icon} me-1`} />{action.label}</Label>
                    <div id={`card-action-info-${action.id}`} className="text-muted small"><i className="ri-information-line me-1" />{action.description}</div>
                    {action.config === "routine_agent" && selected.includes(action.id) && (() => {
                      const saved = context.assignments.find(item => item.columnId === columnId && item.actionId === action.id);
                      return (
                        <div className="mt-2 ms-1" style={{ maxWidth: 420 }}>
                          <Label for={`card-action-agent-${action.id}`} className="small mb-1">Agente de IA (rotina Claude)</Label>
                          <Input id={`card-action-agent-${action.id}`} type="select" bsSize="sm" value={agentDrafts[action.id] ?? ""} disabled={saving}
                            onChange={event => setAgentDrafts(current => ({ ...current, [action.id]: event.target.value }))}>
                            <option value="">{agents.length ? "Selecione o agente" : agentsError ? "Agentes indisponíveis" : "Nenhum agente de rotina nesta conta"}</option>
                            {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                          </Input>
                          <div className="form-text">
                            {saved && saved.agentId && !saved.configuredByCurrentUser
                              ? "Configurado por outra conta. Salvar com um agente seu torna a sua conta a executora da rotina."
                              : "A rotina roda na sua conta Claude: quem salva esta configuração executa a validação."}
                            {agents.length === 0 && <> Crie um agente de rotina em <Link href="/flow/configuracoes/ia/agentes">Configurações → IA → Agentes</Link>.</>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </section>
            ))}
            <p className="small text-muted mb-0">{selected.length} ação(ões) selecionada(s). Desmarque todas para remover os botões desta coluna.</p>
          </Col></Row>
        </ModalBody>
        <ModalFooter>
          <Button color="light" disabled={saving} onClick={() => setColumnId(null)}>Cancelar</Button>
          <Button color="primary" disabled={saving} onClick={() => void save()}>{saving && <Spinner size="sm" className="me-1" />}Salvar</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
