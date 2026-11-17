"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { movementActionConfig, movementDestinations } from "@/modules/kanban/lib/automation-movement";
import Link from "next/link";
import { Alert, Badge, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { AiAgent, aiGatewayApi } from "@/lib/ai-gateway-api";
import {
  AutomationActionType,
  AutomationDocumentGenerator,
  AutomationExpectedResult,
  AutomationRecipientRole,
  AutomationTriggerType,
  BoardColumnDto,
  BoardDto,
  BoardMemberDto,
  ColumnAutomationActionConfigDto,
  ColumnAutomationRuleDto,
  ENTRY_REQUIREMENT_LABEL,
  EntryRequirement,
  CustomerDocumentType,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import CustomerDocumentTypeChecklist from "./customers/CustomerDocumentTypeChecklist";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";
import { CUSTOMER_DOCUMENT_CATALOG } from "./customers/CustomerDocumentsStep";

const ALL_DOCUMENT_TYPES: CustomerDocumentType[] = CUSTOMER_DOCUMENT_CATALOG.map((item) => item.type);

interface AutomationRulesSettingsProps {
  boardId: string;
}

const RECIPIENT_ROLE_LABEL: Record<AutomationRecipientRole, string> = {
  assignee: "Responsavel do card",
  creator: "Criador do card",
  board_member: "Membro especifico do board",
};

const TRIGGER_TYPE_LABEL: Record<AutomationTriggerType, string> = {
  column_entered: "Quando o card entrar nesta coluna",
  column_left: "Quando o card sair desta coluna",
  due_date_approaching: "Quando o prazo do card estiver se aproximando",
  card_stale: "Quando o card ficar parado nesta coluna",
  juridico_process_moved: "Quando houver nova movimentação processual (DataJud)",
  djen_publication_received: "Quando houver publicação nova no DJEN",
  ai_completed: "Quando a IA concluir a automacao sem erro",
  signed_kit_approved: "Quando o kit assinado for aprovado",
};

const TRIGGER_TYPE_ICON: Record<AutomationTriggerType, string> = {
  column_entered: "ri-login-circle-line",
  column_left: "ri-logout-circle-line",
  due_date_approaching: "ri-alarm-warning-line",
  card_stale: "ri-time-line",
  juridico_process_moved: "ri-file-text-line",
  djen_publication_received: "ri-newspaper-line",
  ai_completed: "ri-robot-line",
  signed_kit_approved: "ri-quill-pen-line",
};

/** Copy curta usada na listagem de regras, incluindo o N/X configurado quando aplicavel. */
function triggerSummary(rule: ColumnAutomationRuleDto): string {
  switch (rule.triggerType) {
    case "column_entered":
      return "Card entrou na coluna";
    case "column_left":
      return "Card saiu da coluna";
    case "due_date_approaching": {
      const days = rule.triggerConfig?.daysBefore;
      return days === undefined ? "Prazo se aproximando" : `Avisa ${days} dia(s) antes do prazo`;
    }
    case "card_stale": {
      const days = rule.triggerConfig?.daysStale;
      return days === undefined ? "Card parado na coluna" : `Card parado ha ${days} dia(s) na coluna`;
    }
    case "juridico_process_moved":
      return "Movimentação processual (DataJud)";
    case "djen_publication_received":
      return "Publicação nova no DJEN";
    case "ai_completed":
      return "IA concluiu a automacao sem erro";
    case "signed_kit_approved":
      return "Kit assinado aprovado";
    default:
      return rule.triggerType;
  }
}

export default function AutomationRulesSettings({ boardId }: AutomationRulesSettingsProps) {
  const [board, setBoard] = useState<BoardDto | null>(null);
  const [columns, setColumns] = useState<BoardColumnDto[]>([]);
  const [members, setMembers] = useState<BoardMemberDto[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");
  const [rules, setRules] = useState<ColumnAutomationRuleDto[]>([]);

  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  // Regra em edicao no mesmo modal da criacao; null = nova automacao.
  const [editingRule, setEditingRule] = useState<ColumnAutomationRuleDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("column_entered");
  const [daysBeforeInput, setDaysBeforeInput] = useState("");
  const [daysStaleInput, setDaysStaleInput] = useState("");
  const [recipientRole, setRecipientRole] = useState<AutomationRecipientRole>("assignee");
  const [boardMemberIdentityId, setBoardMemberIdentityId] = useState("");
  const [actionType, setActionType] = useState<AutomationActionType>("send_email_notification");
  const [agentId, setAgentId] = useState("");
  const [documentTypes, setDocumentTypes] = useState<CustomerDocumentType[]>(ALL_DOCUMENT_TYPES);
  // Rotina da Analise de Acoes: coluna para onde o Flow move o card com acoes registradas.
  const [destinationColumnId, setDestinationColumnId] = useState("");
  const [expectedResult, setExpectedResult] = useState<AutomationExpectedResult>("comment");
  const [documentGenerator, setDocumentGenerator] = useState<AutomationDocumentGenerator>("flow");
  const [requirements, setRequirements] = useState<EntryRequirement[]>(["customer_hiscon"]);
  const [ruleToRemove, setRuleToRemove] = useState<ColumnAutomationRuleDto | null>(null);
  // Agents do proprio usuario (gateway de IA): a execucao usa a chave ou a assinatura dele.
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const loadBoardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [boardResult, columnsResult, membersResult] = await Promise.all([
        kanbanApi.boards.get(boardId),
        kanbanApi.columns.list(boardId),
        kanbanApi.members.list(boardId),
      ]);
      setBoard(boardResult);
      const sortedColumns = columnsResult.data.sort((a, b) => a.position - b.position);
      setColumns(sortedColumns);
      setMembers(membersResult.data.filter((member) => member.status === "active"));
      setSelectedColumnId((current) => current || sortedColumns[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configuracao da coluna");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void loadBoardData();
  }, [loadBoardData]);

  // Recarregado ao abrir o modal: agente criado em outra aba aparece sem recarregar a pagina.
  const loadAgents = useCallback(
    () =>
      aiGatewayApi.agents
        .list()
        .then((result) => {
          setAgents(result);
          setAgentsError(null);
          return result;
        })
        .catch(() => {
          setAgents([]);
          setAgentsError("Nao foi possivel carregar seus agentes de IA (verifique a permissao de agentes).");
          return [] as AiAgent[];
        }),
    []
  );

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const activeAgents = useMemo(() => agents.filter(isAutomationAgent), [agents]);

  const loadRules = useCallback(async () => {
    if (!selectedColumnId) {
      setRules([]);
      return;
    }
    setRulesLoading(true);
    setError(null);
    try {
      const result = await kanbanApi.automationRules.list(boardId, selectedColumnId);
      setRules(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar automacoes da coluna");
    } finally {
      setRulesLoading(false);
    }
  }, [boardId, selectedColumnId]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const isBoardAdmin = board?.currentUserRole === "board_admin";
  // Edicao de regra cujo agente nao esta na lista do usuario (agente de outro usuario
  // ou desativado): mantem o agente da regra e permite ajustar so os documentos.
  const keepsRuleAgent =
    editingRule?.actionType === "execute_ai_agent" &&
    agentId === editingRule.actionConfig?.agentId &&
    !activeAgents.some((agent) => agent.id === agentId);
  const selectedIsRoutine = keepsRuleAgent
    ? editingRule?.actionConfig?.connectionMode === "claude_routine"
    : activeAgents.find((agent) => agent.id === agentId)?.executionMode === "claude_routine";
  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === selectedColumnId) ?? null,
    [columns, selectedColumnId]
  );

  function openCreateModal() {
    setEditingRule(null);
    setTriggerType("column_entered");
    setDaysBeforeInput("");
    setDaysStaleInput("");
    setRecipientRole("assignee");
    setBoardMemberIdentityId("");
    setActionType("send_email_notification");
    setAgentId(activeAgents[0]?.id ?? "");
    setDocumentTypes(ALL_DOCUMENT_TYPES);
    setDestinationColumnId("");
    setExpectedResult("comment");
    setDocumentGenerator("flow");
    setRequirements(["customer_hiscon"]);
    setModalOpen(true);
    void loadAgents().then((result) => {
      const eligible = result.filter(isAutomationAgent);
      setAgentId((current) => (eligible.some((agent) => agent.id === current) ? current : eligible[0]?.id ?? ""));
    });
  }

  function openEditModal(rule: ColumnAutomationRuleDto) {
    setEditingRule(rule);
    setTriggerType(rule.triggerType);
    setDaysBeforeInput(rule.triggerConfig?.daysBefore !== undefined ? String(rule.triggerConfig.daysBefore) : "");
    setDaysStaleInput(rule.triggerConfig?.daysStale !== undefined ? String(rule.triggerConfig.daysStale) : "");
    setRecipientRole(rule.recipientRole ?? "assignee");
    setBoardMemberIdentityId(rule.actionConfig?.boardMemberIdentityId ?? "");
    setActionType(rule.actionType);
    setAgentId(rule.actionConfig?.agentId ?? "");
    setDocumentTypes(rule.actionConfig?.customerDocumentTypes ?? ALL_DOCUMENT_TYPES);
    setDestinationColumnId(rule.actionConfig?.toBoardColumnId ?? "");
    setExpectedResult(rule.actionConfig?.expectedResult ?? "comment");
    setDocumentGenerator(rule.actionConfig?.documentGenerator ?? "flow");
    setRequirements(rule.actionConfig?.requirements ?? ["customer_hiscon"]);
    setModalOpen(true);
    void loadAgents();
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  async function handleSubmitRule(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedColumnId) return;

    if (actionType === "move_card" && (!destinationColumnId || destinationColumnId === selectedColumnId)) {
      setError("Selecione uma coluna de destino diferente da origem.");
      return;
    }

    if (actionType === "require_to_enter" && (triggerType !== "column_entered" || requirements.length === 0)) {
      setError("Marque ao menos um requisito; a regra vale ao entrar na coluna.");
      return;
    }

    if (actionType === "send_email_notification" && recipientRole === "board_member" && !boardMemberIdentityId) {
      setError("Selecione o membro do board que vai receber a notificacao.");
      return;
    }
    const agent = activeAgents.find((candidate) => candidate.id === agentId);
    if (actionType === "execute_ai_agent" && !agent && !keepsRuleAgent) {
      setError("Selecione o agente de IA que sera executado.");
      return;
    }

    let triggerConfig: { daysBefore?: number; daysStale?: number } = {};
    if (triggerType === "due_date_approaching") {
      const daysBefore = Number(daysBeforeInput);
      if (daysBeforeInput.trim() === "" || !Number.isInteger(daysBefore) || daysBefore < 0) {
        setError("Informe um numero inteiro (0 ou mais) de dias antes do prazo.");
        return;
      }
      triggerConfig = { daysBefore };
    } else if (triggerType === "card_stale") {
      const daysStale = Number(daysStaleInput);
      if (daysStaleInput.trim() === "" || !Number.isInteger(daysStale) || daysStale <= 0) {
        setError("Informe um numero inteiro maior que zero de dias parado.");
        return;
      }
      triggerConfig = { daysStale };
    }

    setSaving(true);
    setError(null);
    try {
      if (actionType === "require_to_enter") {
        const actionConfig = { requirements };
        if (editingRule) {
          await kanbanApi.automationRules.update(boardId, selectedColumnId, editingRule.id, { triggerType, triggerConfig, actionConfig });
        } else {
          await kanbanApi.automationRules.create(boardId, selectedColumnId, { triggerType, triggerConfig, actionType, actionConfig });
        }
      } else if (actionType === "move_card") {
        const actionConfig = movementActionConfig(columns, selectedColumnId, destinationColumnId);
        if (editingRule) {
          await kanbanApi.automationRules.update(boardId, selectedColumnId, editingRule.id, { triggerType, triggerConfig, actionConfig });
        } else {
          await kanbanApi.automationRules.create(boardId, selectedColumnId, { triggerType, triggerConfig, actionType, actionConfig });
        }
      } else if (actionType === "execute_ai_agent") {
        const outcome = agentOutcome(selectedIsRoutine, expectedResult, documentGenerator);
        const actionConfig = agent
          ? agentActionConfig(agent, documentTypes, outcome)
          : keptAgentActionConfig(editingRule?.actionConfig ?? {}, documentTypes, outcome);
        if (editingRule) {
          await kanbanApi.automationRules.update(boardId, selectedColumnId, editingRule.id, { triggerType, triggerConfig, actionConfig });
        } else {
          await kanbanApi.automationRules.create(boardId, selectedColumnId, { triggerType, triggerConfig, actionType, actionConfig });
        }
      } else if (editingRule) {
        // {} limpa o membro anterior quando o destinatario deixa de ser um membro especifico.
        await kanbanApi.automationRules.update(boardId, selectedColumnId, editingRule.id, {
          triggerType,
          triggerConfig,
          recipientRole,
          actionConfig: recipientRole === "board_member" ? { boardMemberIdentityId } : {},
        });
      } else {
        await kanbanApi.automationRules.create(boardId, selectedColumnId, {
          triggerType,
          triggerConfig,
          actionType,
          recipientRole,
          actionConfig: recipientRole === "board_member" ? { boardMemberIdentityId } : undefined,
        });
      }
      setModalOpen(false);
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : editingRule ? "Erro ao salvar automacao" : "Erro ao criar automacao");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(rule: ColumnAutomationRuleDto) {
    if (!selectedColumnId) return;
    setError(null);
    try {
      await kanbanApi.automationRules.update(boardId, selectedColumnId, rule.id, { isActive: !rule.isActive });
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar automacao");
    }
  }

  async function handleRemoveRule(rule: ColumnAutomationRuleDto) {
    if (!selectedColumnId) return;
    setError(null);
    try {
      await kanbanApi.automationRules.remove(boardId, selectedColumnId, rule.id);
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover automacao");
    }
  }

  function actionLabel(rule: ColumnAutomationRuleDto): string {
    if (rule.actionType === "move_card") return "Ir para a coluna";
    if (rule.actionType === "require_to_enter") return `Exigir para entrar: ${entryRequirementsLabel(rule.actionConfig?.requirements)}`;
    if (rule.actionType !== "execute_ai_agent") return "Notificar por e-mail";
    const agent = agents.find((candidate) => candidate.id === rule.actionConfig?.agentId);
    const mode = rule.actionConfig?.connectionMode === "claude_routine" ? "assinatura Claude" : "chave de API";
    const base = agent ? `Executar agente: ${agent.name} (${mode})` : `Executar agente de outro usuario (${mode})`;
    return base + expectedResultLabel(rule.actionConfig) + documentListLabel(rule.actionConfig?.customerDocumentTypes);
  }

  function recipientLabel(rule: ColumnAutomationRuleDto): string {
    if (rule.actionType === "move_card") {
      return columns.find((column) => column.id === rule.actionConfig?.toBoardColumnId)?.name ?? "Coluna indisponivel";
    }
    if (rule.actionType === "require_to_enter") {
      return "Bloqueia a entrada do card";
    }
    if (rule.actionType === "execute_ai_agent" || !rule.recipientRole) {
      return "Resultado no card";
    }
    if (rule.recipientRole !== "board_member") {
      return RECIPIENT_ROLE_LABEL[rule.recipientRole];
    }
    const memberId = rule.actionConfig?.boardMemberIdentityId;
    const member = members.find((candidate) => candidate.identityId === memberId);
    const memberName = member?.displayName ?? memberId?.slice(0, 8) ?? "membro removido";
    return `${RECIPIENT_ROLE_LABEL.board_member} (${memberName})`;
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (!isBoardAdmin) {
    return (
      <Alert color="warning" className="mb-0">
        <i className="ri-lock-line me-2" />
        Apenas administradores do board podem configurar automacoes.
      </Alert>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 className="mb-0">Automacoes</h4>
        <Link href={`/flow/boards/${boardId}`} className="btn btn-light btn-sm">
          Voltar ao board
        </Link>
      </div>

      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="card">
        <div className="card-body">
          <div className="row g-3 align-items-end mb-3">
            <div className="col-md-6">
              <label className="form-label small text-muted mb-1" htmlFor="automation-column-select">
                Coluna
              </label>
              <Input
                id="automation-column-select"
                type="select"
                value={selectedColumnId}
                onChange={(event) => setSelectedColumnId(event.target.value)}
              >
                {columns.length === 0 && <option value="">Nenhuma coluna disponivel</option>}
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </Input>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h6 className="mb-0">Regras de {selectedColumn ? `"${selectedColumn.name}"` : "coluna"}</h6>
              <p className="text-muted small mb-0">
                Cada regra dispara uma acao conforme o gatilho: notificar por e-mail, executar um agente de IA ou mover o
                card para outra coluna.
              </p>
            </div>
            <Button color="primary" size="sm" onClick={openCreateModal} disabled={!selectedColumnId}>
              <i className="ri-add-line me-1" />
              Nova automacao
            </Button>
          </div>

          {rulesLoading ? (
            <div className="text-center py-4">
              <Spinner size="sm" />
            </div>
          ) : rules.length === 0 ? (
            <p className="text-muted small mb-0">Nenhuma automacao configurada para esta coluna.</p>
          ) : (
            <Table size="sm" className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Gatilho</th>
                  <th>Acao</th>
                  <th>Destinatario / resultado</th>
                  <th>Status</th>
                  <th className="text-end">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{triggerSummary(rule)}</td>
                    <td>{actionLabel(rule)}</td>
                    <td>{recipientLabel(rule)}</td>
                    <td>
                      <Badge color={rule.isActive ? "success" : "secondary"}>
                        {rule.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td className="text-end">
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 me-3"
                        onClick={() => openEditModal(rule)}
                        title="Editar"
                      >
                        <i className="ri-pencil-line" />
                      </Button>
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 me-3"
                        onClick={() => void handleToggleActive(rule)}
                        title={rule.isActive ? "Desativar" : "Ativar"}
                      >
                        <i className={rule.isActive ? "ri-pause-circle-line" : "ri-play-circle-line"} />
                      </Button>
                      <Button
                        color="link"
                        size="sm"
                        className="p-0 text-muted"
                        onClick={() => setRuleToRemove(rule)}
                        title="Remover"
                      >
                        <i className="ri-delete-bin-line" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} toggle={closeModal} centered>
        <ModalHeader toggle={closeModal}>{editingRule ? "Editar automacao" : "Nova automacao"}</ModalHeader>
        <form onSubmit={(event) => void handleSubmitRule(event)}>
          <ModalBody>
            <div className="alert alert-light border d-flex align-items-start gap-2 mb-3">
              <i className={`${TRIGGER_TYPE_ICON[triggerType]} fs-4 text-primary`} />
              <div>
                <div className="fw-semibold">
                  {actionType === "move_card"
                    ? "Ir para a coluna"
                    : actionType === "execute_ai_agent"
                      ? "Executar agente de IA"
                      : actionType === "require_to_enter"
                        ? "Exigir para entrar"
                        : "Notificar por e-mail"}{" "}
                  {TRIGGER_TYPE_LABEL[triggerType].toLowerCase()}
                </div>
                <div className="text-muted small">
                  {actionType === "move_card"
                    ? "O Flow move o card conforme esta regra, com as permissoes de quem a criou e as mesmas checagens da tela (transicao, checklist, limite da coluna, requisitos de entrada)."
                    : actionType === "require_to_enter"
                      ? "O card so entra nesta coluna quando cumprir os requisitos marcados. Vale para qualquer pessoa e para os movimentos por automacao; card que ja esta na coluna nao e afetado."
                      : actionType === "execute_ai_agent"
                      ? `${EXPECTED_RESULT_SUMMARY[agentOutcome(selectedIsRoutine, expectedResult, documentGenerator).expectedResult]} A IA nunca move o card nem aprova nada. Para o card andar quando ela concluir, crie nesta coluna uma regra "${TRIGGER_TYPE_LABEL.ai_completed}" com "Ir para a coluna".`
                      : "Os destinatarios recebem um e-mail quando o gatilho acontecer."}
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="automation-trigger-type">
                Gatilho *
              </label>
              <Input
                id="automation-trigger-type"
                type="select"
                value={triggerType}
                onChange={(event) => {
                  const next = event.target.value as AutomationTriggerType;
                  setTriggerType(next);
                  // A conclusao da IA so move o card (flow-ai-completion-sprints.md).
                  // A conclusao da IA e a aprovacao do kit assinado so movem o card.
                  if (next === "ai_completed" || next === "signed_kit_approved") setActionType("move_card");
                  // Requisito de entrada so vale ao entrar na coluna.
                  if (next !== "column_entered" && actionType === "require_to_enter") setActionType("move_card");
                }}
              >
                <option value="column_entered">{TRIGGER_TYPE_LABEL.column_entered}</option>
                <option value="column_left">{TRIGGER_TYPE_LABEL.column_left}</option>
                <option value="due_date_approaching">{TRIGGER_TYPE_LABEL.due_date_approaching}</option>
                <option value="card_stale">{TRIGGER_TYPE_LABEL.card_stale}</option>
                <option value="juridico_process_moved">{TRIGGER_TYPE_LABEL.juridico_process_moved}</option>
                <option value="djen_publication_received">{TRIGGER_TYPE_LABEL.djen_publication_received}</option>
                <option value="ai_completed">{TRIGGER_TYPE_LABEL.ai_completed}</option>
                <option value="signed_kit_approved">{TRIGGER_TYPE_LABEL.signed_kit_approved}</option>
              </Input>
              {triggerType === "ai_completed" && (
                <div className="form-text">{AI_COMPLETED_HELP}</div>
              )}
              {triggerType === "signed_kit_approved" && (
                <div className="form-text">{SIGNED_KIT_APPROVED_HELP}</div>
              )}
            </div>

            {triggerType === "due_date_approaching" && (
              <div className="mb-3">
                <label className="form-label" htmlFor="automation-days-before">
                  Avisar quantos dias antes do prazo *
                </label>
                <Input
                  id="automation-days-before"
                  type="number"
                  min={0}
                  step={1}
                  value={daysBeforeInput}
                  onChange={(event) => setDaysBeforeInput(event.target.value)}
                  placeholder="Ex.: 3"
                />
              </div>
            )}

            {triggerType === "card_stale" && (
              <div className="mb-3">
                <label className="form-label" htmlFor="automation-days-stale">
                  Por quantos dias parado *
                </label>
                <Input
                  id="automation-days-stale"
                  type="number"
                  min={1}
                  step={1}
                  value={daysStaleInput}
                  onChange={(event) => setDaysStaleInput(event.target.value)}
                  placeholder="Ex.: 5"
                />
              </div>
            )}

            {triggerType === "juridico_process_moved" && (
              <div className="alert alert-light border d-flex align-items-start gap-2 mb-3">
                <i className="ri-information-line fs-5 text-muted" />
                <div className="text-muted small">
                  Só dispara para cards com processo monitorado no DataJud, quando aparecer movimentação nova e o
                  card estiver nesta coluna. Cards sem processo monitorado nunca acionam esta automação.
                </div>
              </div>
            )}

            {triggerType === "djen_publication_received" && (
              <div className="alert alert-light border d-flex align-items-start gap-2 mb-3">
                <i className="ri-information-line fs-5 text-muted" />
                <div className="text-muted small">{DJEN_PUBLICATION_HELP}</div>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label" htmlFor="automation-action-type">
                Acao *
              </label>
              <Input
                id="automation-action-type"
                type="select"
                value={actionType}
                onChange={(event) => setActionType(event.target.value as AutomationActionType)}
                disabled={editingRule !== null}
              >
                <option value="send_email_notification" disabled={MOVE_ONLY_TRIGGERS.includes(triggerType)}>Notificar por e-mail</option>
                <option value="execute_ai_agent" disabled={MOVE_ONLY_TRIGGERS.includes(triggerType)}>Executar agente de IA</option>
                <option value="move_card">Ir para a coluna</option>
                <option value="require_to_enter" disabled={triggerType !== "column_entered"}>Exigir para entrar</option>
              </Input>
              {editingRule && (
                <div className="form-text">Para trocar o tipo de acao, remova esta automacao e crie outra.</div>
              )}
              {actionType === "execute_ai_agent" && !["column_entered", "column_left"].includes(triggerType) && (
                <div className="form-text text-warning">Agentes de IA so podem usar os gatilhos de entrada ou saida da coluna.</div>
              )}
            </div>

            {actionType === "execute_ai_agent" && (
              <div className="mb-1">
                <label className="form-label" htmlFor="automation-agent">
                  Agente *
                </label>
                <Input
                  id="automation-agent"
                  type="select"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  disabled={activeAgents.length === 0 && !keepsRuleAgent}
                >
                  {keepsRuleAgent && <option value={agentId}>Agente atual da regra (fora da sua lista)</option>}
                  {activeAgents.length === 0 && !keepsRuleAgent && <option value="">Nenhum agente elegivel</option>}
                  {activeAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} —{" "}
                      {agent.executionMode === "claude_routine" ? "assinatura Claude (rotina)" : `chave de API (${agent.model})`}
                    </option>
                  ))}
                </Input>
                <div className="form-text">
                  {agentsError ??
                    (activeAgents.length === 0
                      ? "Cadastre um agente de rotina Claude, ou OpenAI com ferramentas, em Configuracoes -> IA -> Agentes."
                      : "Somente seus agentes aparecem: a execucao usa sua chave de API ou sua assinatura Claude.")}
                </div>
                {selectedIsRoutine && (
                  <div className="mt-3">
                    <span className="form-label d-block">Documentos do cliente que a rotina pode ler</span>
                    <CustomerDocumentTypeChecklist idPrefix="automation-docs" selected={documentTypes} onChange={setDocumentTypes} />
                    <div className="form-text">So os documentos marcados saem do Flow nesta automacao.</div>
                  </div>
                )}
              </div>
            )}

            {actionType === "execute_ai_agent" && (
              <div className="mt-3">
                <label className="form-label" htmlFor="automation-expected-result">
                  Resultado esperado *
                </label>
                <Input
                  id="automation-expected-result"
                  type="select"
                  value={selectedIsRoutine ? expectedResult : "comment"}
                  onChange={(event) => setExpectedResult(event.target.value as AutomationExpectedResult)}
                  disabled={!selectedIsRoutine}
                >
                  <option value="comment">{EXPECTED_RESULT_LABEL.comment}</option>
                  {selectedIsRoutine && <option value="action_analysis">{EXPECTED_RESULT_LABEL.action_analysis}</option>}
                  {selectedIsRoutine && <option value="initial_petitions">{EXPECTED_RESULT_LABEL.initial_petitions}</option>}
                </Input>
                <div className="form-text">
                  {selectedIsRoutine
                    ? EXPECTED_RESULT_HELP[expectedResult]
                    : `${EXPECTED_RESULT_HELP.comment} Analise de acoes e Peticoes iniciais exigem rotina Claude.`}
                </div>
                {selectedIsRoutine && expectedResult === "initial_petitions" && (
                  <div className="mt-3">
                    <label className="form-label" htmlFor="automation-document-generator">
                      Quem gera o documento *
                    </label>
                    <Input
                      id="automation-document-generator"
                      type="select"
                      value={documentGenerator}
                      onChange={(event) => setDocumentGenerator(event.target.value as AutomationDocumentGenerator)}
                    >
                      <option value="flow">Flow (padrao)</option>
                      <option value="ai">IA</option>
                    </Input>
                    <div className="form-text">{DOCUMENT_GENERATOR_HELP[documentGenerator]}</div>
                  </div>
                )}
              </div>
            )}

            {actionType === "require_to_enter" && (
              <div className="mb-3">
                <div className="form-label">O card precisa ter *</div>
                {(Object.keys(ENTRY_REQUIREMENT_LABEL) as EntryRequirement[]).map((requirement) => (
                  <div className="form-check" key={requirement}>
                    <Input
                      id={`automation-requirement-${requirement}`}
                      type="checkbox"
                      className="form-check-input"
                      checked={requirements.includes(requirement)}
                      onChange={(event) =>
                        setRequirements((current) =>
                          event.target.checked ? [...current, requirement] : current.filter((item) => item !== requirement),
                        )
                      }
                    />
                    <label className="form-check-label" htmlFor={`automation-requirement-${requirement}`}>
                      {ENTRY_REQUIREMENT_LABEL[requirement]}
                    </label>
                  </div>
                ))}
                <div className="form-text">
                  HISCON do cliente: o cliente vinculado ao card tem o HISCON na ficha. Kit assinado aprovado: o kit mais
                  recente do cliente tem o assinado aprovado pelo Validador de assinatura e confirmado por uma pessoa.
                  Card sem cliente nao e barrado.
                </div>
              </div>
            )}

            {actionType === "move_card" && (
              <div className="mb-3">
                <label className="form-label" htmlFor="automation-destination-column">
                  Coluna de destino *
                </label>
                <Input
                  id="automation-destination-column"
                  type="select"
                  value={destinationColumnId}
                  onChange={(event) => setDestinationColumnId(event.target.value)}
                >
                  <option value="">Selecione uma coluna...</option>
                  {movementDestinations(columns, selectedColumnId).map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </Input>
              </div>
            )}

            {actionType === "send_email_notification" && (
            <div className="mb-3">
              <label className="form-label" htmlFor="automation-recipient-role">
                Destinatario *
              </label>
              <Input
                id="automation-recipient-role"
                type="select"
                value={recipientRole}
                onChange={(event) => setRecipientRole(event.target.value as AutomationRecipientRole)}
              >
                <option value="assignee">{RECIPIENT_ROLE_LABEL.assignee}</option>
                <option value="creator">{RECIPIENT_ROLE_LABEL.creator}</option>
                <option value="board_member">{RECIPIENT_ROLE_LABEL.board_member}</option>
              </Input>
            </div>
            )}

            {actionType === "send_email_notification" && recipientRole === "board_member" && (
              <div className="mb-1">
                <label className="form-label" htmlFor="automation-board-member">
                  Membro do board *
                </label>
                <Input
                  id="automation-board-member"
                  type="select"
                  value={boardMemberIdentityId}
                  onChange={(event) => setBoardMemberIdentityId(event.target.value)}
                >
                  <option value="">Selecione um membro...</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.identityId}>
                      {member.displayName ?? member.identityId.slice(0, 8)}
                    </option>
                  ))}
                </Input>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="light" type="button" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button
              color="primary"
              type="submit"
              disabled={
                saving ||
                (actionType === "move_card" && !destinationColumnId) ||
                (actionType === "require_to_enter" && (requirements.length === 0 || triggerType !== "column_entered")) ||
                (actionType === "execute_ai_agent" &&
                  (!agentId || !["column_entered", "column_left"].includes(triggerType)))
              }
            >
              {saving ? <Spinner size="sm" className="me-1" /> : null}
              Salvar
            </Button>
          </ModalFooter>
        </form>
      </Modal>
      <ConfirmActionModal
        isOpen={ruleToRemove !== null}
        title="Remover esta automação da coluna?"
        icon="ri-delete-bin-line"
        color="danger"
        confirmLabel="Remover"
        onCancel={() => setRuleToRemove(null)}
        onConfirm={() => {
          const rule = ruleToRemove;
          setRuleToRemove(null);
          if (rule) void handleRemoveRule(rule);
        }}
      >
        <p className="mb-0">A regra deixa de disparar. O histórico das execuções já realizadas é preservado.</p>
      </ConfirmActionModal>
    </div>
  );
}

/** Requisitos de entrada da regra, por extenso ("HISCON do cliente"). */
export function entryRequirementsLabel(requirements: EntryRequirement[] | undefined): string {
  return (requirements ?? []).map((item) => ENTRY_REQUIREMENT_LABEL[item] ?? item).join(", ") || "nenhum";
}

/** Resumo da lista de documentos da regra: nome curto antes do travessao ("HISCRED"). */
export function documentListLabel(types: CustomerDocumentType[] | undefined): string {
  if (!types) return "";
  if (types.length === 0) return " · sem documentos do cliente";
  const names = types.map((type) => CUSTOMER_DOCUMENT_CATALOG.find((item) => item.type === type)?.label.split(" — ")[0] ?? type);
  return ` · documentos: ${names.join(", ")}`;
}

/**
 * Agente que produz efeito numa automacao: rotina Claude (comenta pelo
 * conector) ou chave de API OpenAI com ferramentas, unico caminho pelo qual o
 * resultado chega ao card. Agente de API sem ferramentas seria cobrado sem
 * alterar nada.
 */
export function isAutomationAgent(agent: AiAgent): boolean {
  if (agent.status !== "active") return false;
  if (agent.executionMode === "claude_routine") return true;
  return agent.provider === "openai" && agent.allowedTools.length > 0;
}

/**
 * Edicao que mantem o agente da regra (fora da lista do usuario): preserva a
 * configuracao salva e troca so a lista de documentos, com a mesma regra de
 * `agentActionConfig` (todos marcados = sem lista).
 */
export function keptAgentActionConfig(
  config: ColumnAutomationActionConfigDto,
  documentTypes: CustomerDocumentType[],
  outcome: AgentOutcome = { expectedResult: "comment" }
) {
  const kept = { ...config };
  delete kept.customerDocumentTypes;
  delete kept.expectedResult;
  delete kept.documentGenerator;
  const routine = config.connectionMode === "claude_routine";
  return {
    ...kept,
    ...(routine && documentTypes.length < CUSTOMER_DOCUMENT_CATALOG.length ? { customerDocumentTypes: documentTypes } : {}),
    ...outcome,
  };
}

/**
 * Configuracao exigida pelo BFF para `execute_ai_agent`: o modo de conexao
 * segue o agent; cada modo tem sua politica de ferramentas.
 */
export function agentActionConfig(
  agent: AiAgent,
  documentTypes?: CustomerDocumentType[],
  outcome: AgentOutcome = { expectedResult: "comment" }
) {
  const routine = agent.executionMode === "claude_routine";
  return {
    agentId: agent.id,
    connectionMode: routine ? ("claude_routine" as const) : ("api_key" as const),
    inputPolicyVersion: 1,
    // 2026-10-21.v1: agente de chave de API com `kanban.automation.complete` (confirmacao explicita).
    toolPolicyVersion: routine ? "claude_routine.v1" : "2026-10-21.v1",
    // Rotina: documentos do cliente do card liberados na regra (ADR 019). Todos marcados = sem lista.
    ...(routine && documentTypes && documentTypes.length < CUSTOMER_DOCUMENT_CATALOG.length ? { customerDocumentTypes: documentTypes } : {}),
    ...outcome,
  };
}

export interface AgentOutcome {
  expectedResult: AutomationExpectedResult;
  documentGenerator?: AutomationDocumentGenerator;
}

/**
 * Resultado esperado enviado ao BFF (ADR 020): agente de chave de API so comenta; o gerador do
 * documento existe so em Peticoes iniciais.
 */
export function agentOutcome(
  routine: boolean,
  expectedResult: AutomationExpectedResult,
  documentGenerator: AutomationDocumentGenerator
): AgentOutcome {
  if (!routine) return { expectedResult: "comment" };
  return expectedResult === "initial_petitions" ? { expectedResult, documentGenerator } : { expectedResult };
}

export const EXPECTED_RESULT_LABEL: Record<AutomationExpectedResult, string> = {
  comment: "Comentario",
  action_analysis: "Analise de acoes",
  initial_petitions: "Peticoes iniciais",
};

/** Abertura do aviso do modal, pelo resultado esperado. */
const EXPECTED_RESULT_SUMMARY: Record<AutomationExpectedResult, string> = {
  comment: "O agente roda em seu nome, le o card e registra o resultado num comentario.",
  action_analysis: "A rotina roda em seu nome, le os documentos do cliente liberados abaixo e registra no card as acoes identificadas.",
  initial_petitions:
    "A rotina roda em seu nome, le o cliente, os documentos liberados abaixo e a analise de acoes e registra no card as peticoes iniciais, que ficam pendentes de aprovacao do advogado.",
};

/** Quem encerra a execucao e o que conta como concluir sem erro (dispara as regras de conclusao da IA). */
const EXPECTED_RESULT_HELP: Record<AutomationExpectedResult, string> = {
  comment:
    "Concluir sem erro: a IA confirma explicitamente que fez todas as tarefas (flow_complete_automation na rotina, kanban.automation.complete na chave de API). Comentario sozinho nao conclui.",
  action_analysis:
    "Concluir sem erro: a rotina registra a analise pela ferramenta do Flow, concluida com ao menos uma acao. Comentario nao conclui.",
  initial_petitions:
    "Concluir sem erro: a rotina encerra com ao menos uma peticao registrada (dados em XXXX nao impedem). Antes de chamar a rotina, o Flow confere na ficha a validacao aprovada, a UF do endereco e as acoes ja ajuizadas (ou a confirmacao de que nao ha nenhuma); faltando algo, a execucao falha com o motivo no card.",
};

/** Gatilho de conclusao da IA (flow-ai-completion-sprints.md). */
/** Gatilhos que so aceitam "Ir para a coluna" (o backend recusa outra acao). */
const MOVE_ONLY_TRIGGERS: AutomationTriggerType[] = ["ai_completed", "signed_kit_approved"];

const DJEN_PUBLICATION_HELP =
  "Dispara para cada publicação ou intimação nova encontrada no DJEN no processo do card, quando o card estiver nesta coluna. Exige Publicações processuais (DJEN) contratadas e o DJEN ligado no card. Publicações que já existiam quando o acompanhamento começou não disparam. Para usar IA, mova o card para uma coluna com a regra \"Executar agente de IA\" ao entrar.";

const SIGNED_KIT_APPROVED_HELP =
  "Dispara quando uma pessoa confirma o kit assinado aprovado pelo Validador de assinatura, para o card que esta nesta coluna. O movimento roda em segundo plano, em ate um minuto, com as mesmas checagens da tela (inclusive os requisitos de entrada da coluna de destino).";

const AI_COMPLETED_HELP =
  "Dispara quando uma automacao de IA desta coluna conclui sem erro (conforme o resultado esperado da regra do agente). Falha, revisao pendente ou execucao sem resposta nao disparam. O movimento roda em segundo plano, em ate um minuto.";

const DOCUMENT_GENERATOR_HELP: Record<AutomationDocumentGenerator, string> = {
  flow: "A rotina envia o conteudo e o Flow monta o Word no padrao do escritorio, recusando texto com travessao, \"(a)\" ou nota sem link.",
  ai: "A rotina monta o Word e envia o arquivo; o Flow confere so tipo, tamanho, nome e a seguranca do arquivo, nao o texto. Ainda nao disponivel: o envio do arquivo pela rotina entra na proxima etapa, e ate la a execucao nao conclui.",
};

/** Resultado esperado na lista de regras; regra antiga sem o campo segue como comentario. */
export function expectedResultLabel(config: ColumnAutomationActionConfigDto | null | undefined): string {
  const result = config?.expectedResult ?? "comment";
  const generator = result === "initial_petitions" ? ` (documento: ${config?.documentGenerator === "ai" ? "IA" : "Flow"})` : "";
  return ` · resultado: ${EXPECTED_RESULT_LABEL[result].toLowerCase()}${generator}`;
}
