"use client";

import { getApplicationAuthToken } from "@/lib/module-auth-token";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PLATFORM_API_URL ?? "http://127.0.0.1:8010";

export function getKanbanAuthToken(): string | null {
  return getApplicationAuthToken("app:flow");
}

/**
 * Erro HTTP do BFF Flow. `message` continua sendo o corpo bruto (compatibilidade
 * com os paineis existentes); `code` e `detail` vem do corpo estruturado
 * `{ code, message }` quando houver (ex.: 409 `customer_outside_boards`).
 */
export class KanbanApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly detail: string | null;
  /** Corpo JSON completo (ex.: `pendingDocumentTypes` de `checklist_incomplete`). */
  readonly payload: Record<string, unknown> | null;

  constructor(status: number, body: string) {
    super(body || `Flow API error ${status}`);
    this.name = "KanbanApiError";
    this.status = status;
    let code: string | null = null;
    let detail: string | null = null;
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
      payload = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      code = typeof parsed.code === "string" ? parsed.code : null;
      if (typeof parsed.message === "string") {
        detail = parsed.message;
      } else if (Array.isArray(parsed.message)) {
        detail = parsed.message.filter((item) => typeof item === "string").join("; ");
      }
    } catch {
      // corpo nao-JSON: mantem so a mensagem bruta
    }
    this.code = code;
    this.detail = detail;
    this.payload = payload;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getKanbanAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new KanbanApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// Upload multipart: nao define Content-Type manualmente, o browser monta o
// boundary do multipart/form-data ao enviar um FormData.
async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = getKanbanAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { method: "POST", body: formData, headers });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new KanbanApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export type BoardMemberRole = "board_admin" | "board_member" | "board_viewer";

export interface CardActionDto {
  id: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  boardSelectable: boolean;
  /** `dialog`: o botao abre a tela propria da acao em vez de chamar o endpoint de execucao. */
  interaction: "execute" | "dialog";
  /** O botao so aparece nos cards listados em `availableCardIds[actionId]`. */
  perCardAvailability: boolean;
  /** `routine_agent`: ao atribuir a coluna, exige agente de rotina de quem configura (flow-signed-kit S5). */
  config?: "routine_agent";
}

/** Atribuicao da acao a coluna; `agentId` so nas acoes com `config`. Quem configurou executa a rotina. */
export interface ColumnActionAssignmentDto {
  columnId: string;
  actionId: string;
  agentId: string | null;
  configuredByCurrentUser: boolean;
}

export interface ColumnActionConfigInput {
  actionId: string;
  agentId: string;
}

export interface BoardActionsDto {
  categories: { id: string; label: string }[];
  actions: CardActionDto[];
  columns: { id: string; name: string }[];
  assignments: ColumnActionAssignmentDto[];
  /** Por acao com `perCardAvailability`: cards do board em que a acao tem o que fazer. */
  availableCardIds: Record<string, string[]>;
  canConfigure: boolean;
  canExecute: boolean;
}

export interface CardActionResultDto {
  actionId: string;
  cardId: string;
  message: string;
}
export type ResourceStatus = "active" | "archived";
export type DataJudMonitorCadence = "daily" | "weekly" | "biweekly" | "monthly";

/** Resultado da ultima consulta ao DataJud do acompanhamento (process-monitoring-sprints.md, Sprint 4). */
export type MonitoringCheckStatus = "success" | "not_found" | "restricted" | "rate_limited" | "timeout" | "provider_unavailable" | "failed";

export interface CardMonitoringDto {
  monitoring: boolean;
  monitorId: string | null;
  hasSource: boolean;
  /** Capacidade `monitoramento-processual` contratada; false = olho do DataJud bloqueado. */
  contracted?: boolean;
  cadence?: DataJudMonitorCadence;
  lastCheck?: { status: MonitoringCheckStatus; checkedAt: string } | null;
  nextCheckAt?: string | null;
  /** Publicacoes (DJEN), ADR 022: presente com acompanhamento; `available` false = nao contratado. */
  djen?: CardDjenDto;
  process?: CardProcessDetailsDto | null;
}

export type DjenCadenceDays = 1 | 3 | 7;

export interface CardDjenDto {
  available: boolean;
  enabled: boolean;
  cadenceDays: DjenCadenceDays;
  lastCheck: { status: MonitoringCheckStatus; checkedAt: string } | null;
  /** AAAA-MM-DD (Brasilia). */
  nextCheckOn: string | null;
}

/** Publicacao do DJEN no card (ADR 022): texto puro, nunca HTML. */
export interface CardPublicationDto {
  id: string;
  availableOn: string | null;
  communicationType: string | null;
  documentType: string | null;
  courtName: string | null;
  text: string;
  link: string | null;
  isNew: boolean;
}

/** Movimentacao do processo do card (process-monitoring-sprints.md, Sprint 5). */
export interface CardProcessMovementDto {
  id: string;
  description: string;
  occurredAt: string | null;
  /** Detectada depois da primeira consulta; as demais sao o historico que o processo ja tinha. */
  isNew: boolean;
  /** Costuma gerar comunicacao no DJEN: mostra "Ver no DJEN" (Sprint 9). */
  djenLookup?: boolean;
}

/** Dados do processo do ultimo retrato do DataJud (Sprint 9). */
export interface CardProcessDetailsDto {
  filedAt: string | null;
  className: string | null;
  courtName: string | null;
  systemName: string | null;
}

export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface MemberProfileCapabilitiesDto {
  canDeleteArchivedCards: boolean;
  canManageTags: boolean;
  canManageStatuses: boolean;
  canReviewDocuments: boolean;
}

export interface BoardDto {
  id: string;
  name: string;
  description: string | null;
  status: ResourceStatus;
  createdAt: string;
  updatedAt: string;
  currentUserRole: BoardMemberRole | null;
  defaultColumnId?: string | null;
  // So vem populado em kanbanApi.boards.get (board unico); a listagem nao resolve capacidades.
  currentUserCapabilities?: MemberProfileCapabilitiesDto;
  /** Captacao de leads ligada no quadro (CRM de leads, Sprint 4): habilita "Enviar para analise". */
  leadIntakeEnabled: boolean;
}

export interface BoardColumnDto {
  id: string;
  boardId: string;
  name: string;
  position: number;
  color: string | null;
  wipLimit: number | null;
  isDefault: boolean;
  /** Card so entra na coluna com todos os documentos obrigatorios ativos aceitos. */
  requiresCompleteChecklist: boolean;
  status: ResourceStatus;
}

export interface CardDto {
  id: string;
  boardId: string;
  boardColumnId: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourcePayload: Record<string, unknown> | null;
  sourceUrl: string | null;
  position: number;
  status: ResourceStatus;
  cardStatusId: string | null;
  dueDate: string | null;
  /** Escritorio do card (Sprint 3.5); nulo ate o administrador atribuir. */
  officeId: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeIds: string[];
  tagIds: string[];
  commentCount: number;
  attachmentCount: number;
  /** Completude do checklist (obrigatorios ativos aceitos / total), agregada por quadro no backend. */
  documentChecklist: CardChecklistSummaryDto;
  /**
   * Card em coluna com `requiresCompleteChecklist` e obrigatorio pendente (ex.: importado
   * na coluna padrao ou documento rejeitado depois da entrada). Calculado no backend.
   */
  checklistPending: boolean;
  /** Estado do lead (Sprint 4), independente da coluna; `null` = sem envio (rascunho). */
  leadStatus: LeadStatus | null;
  /** Cliente validado sem HISCON: selo "SEM HISCON" (calculado no backend; ausente em respostas antigas). */
  customerWithoutHiscon?: boolean;
  /** Cliente com kit sem o assinado aprovado num quadro que exige o kit assinado: selo "ASSINATURA PENDENTE". */
  signedKitPending?: boolean;
}

export interface CardChecklistSummaryDto {
  acceptedRequired: number;
  totalRequired: number;
}

export interface BoardMemberDto {
  id: string;
  boardId: string;
  identityId: string;
  role: BoardMemberRole;
  status: "active" | "inactive";
  profileId: string | null;
  displayName: string | null;
  documentNumber: string | null;
}

export interface IdentityCandidateDto {
  identityId: string;
  displayName: string | null;
  documentNumber: string | null;
}

export interface MemberProfileDto {
  id: string;
  boardId: string;
  name: string;
  canDeleteArchivedCards: boolean;
  canManageTags: boolean;
  canManageStatuses: boolean;
  canReviewDocuments: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemberProfileTransitionDto {
  id: string;
  profileId: string;
  fromBoardColumnId: string;
  toBoardColumnId: string;
}

export interface BoardColumnPermissionDto {
  id: string;
  profileId: string;
  boardColumnId: string;
  canView: boolean;
  canEdit: boolean;
}

export interface CardAssigneeDto {
  id: string;
  cardId: string;
  identityId: string;
  assignedByIdentityId: string;
  createdAt: string;
}

export type CardActivityType = "comment" | "system_event";

export interface CardActivityDto {
  id: string;
  cardId: string;
  type: CardActivityType;
  authorIdentityId: string;
  textContent: string | null;
  eventPayload: Record<string, unknown> | null;
  createdAt: string;
}

/** Conector Claude do Flow (docs/product/kanban-claude-connector-sprints.md). */
export interface ClaudeConnectorSettingsDto {
  enabled: boolean;
  maskPersonalData: boolean;
  policyAcceptedAt: string | null;
  /** Leitura de documentos da ficha pelo Claude (validacao de cadastro, ADR 017). */
  allowCustomerDocuments: boolean;
  customerDocumentsAcceptedAt: string | null;
  connectorUrl: string;
  canManage: boolean;
}

export interface ClaudeConnectorSettingsWritePayload {
  enabled: boolean;
  maskPersonalData: boolean;
  acceptPolicy?: boolean;
  allowCustomerDocuments?: boolean;
  acceptCustomerDocumentsPolicy?: boolean;
}

export interface CardAttachmentDto {
  id: string;
  activityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByIdentityId: string;
  createdAt: string;
}

export interface AttachmentDownloadUrlDto {
  url: string;
  expiresAt: string;
}

export interface CardTagDto {
  id: string;
  boardId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CardStatusDto {
  id: string;
  boardId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetricsFilters {
  boardId?: string;
  assigneeId?: string;
  statusId?: string;
}

export interface MetricsByStatusDto {
  statusId: string | null;
  statusName: string;
  count: number;
}

export interface MetricsByAssigneeDto {
  identityId: string;
  displayName: string | null;
  count: number;
}

export interface MetricsByColumnDto {
  columnId: string;
  columnName: string;
  count: number;
  wipLimit: number | null;
}

export interface MetricsColumnOverWipDto {
  columnId: string;
  columnName: string;
  count: number;
  wipLimit: number;
}

export interface MetricsThroughputDto {
  createdLast30Days: number;
  archivedLast30Days: number;
}

export interface MetricsLeadTimeByColumnDto {
  columnId: string;
  columnName: string;
  avgDurationSeconds: number;
  visitsCount: number;
}

export interface MetricsDto {
  totalCards: number;
  byStatus: MetricsByStatusDto[];
  byAssignee: MetricsByAssigneeDto[];
  unassignedCount: number;
  overdueCount: number;
  byColumn: MetricsByColumnDto[] | null;
  columnsOverWip: MetricsColumnOverWipDto[];
  throughput: MetricsThroughputDto;
  leadTimeByColumn: MetricsLeadTimeByColumnDto[] | null;
}

export type AutomationTriggerType =
  | "column_entered"
  | "column_left"
  | "ai_completed"
  | "due_date_approaching"
  | "card_stale"
  | "juridico_process_moved"
  | "signed_kit_approved"
  | "djen_publication_received";
export type AutomationActionType = "send_email_notification" | "execute_ai_agent" | "move_card" | "require_to_enter";

/** Requisitos de entrada da coluna (docs/product/flow-signed-kit-sprints.md, S1): regra `require_to_enter`. */
export type EntryRequirement = "customer_hiscon" | "signed_kit";
export const ENTRY_REQUIREMENT_LABEL: Record<EntryRequirement, string> = {
  customer_hiscon: "HISCON do cliente",
  signed_kit: "Kit assinado aprovado",
};
export type AutomationRecipientRole = "assignee" | "creator" | "board_member";

export interface ColumnAutomationActionConfigDto {
  /** move_card: coluna ativa de destino no mesmo board (flow-ai-completion-sprints.md). */
  toBoardColumnId?: string;
  boardMemberIdentityId?: string;
  /** execute_ai_agent: agent do gateway de IA do criador da regra. */
  agentId?: string;
  /** api_key: chave BYOK no gateway. claude_routine: rotina do Claude Code (assinatura). */
  connectionMode?: "api_key" | "claude_routine";
  inputPolicyVersion?: number;
  toolPolicyVersion?: string;
  /** claude_routine: documentos do cliente do card que a rotina pode ler (ADR 019); ausente = todos. */
  customerDocumentTypes?: CustomerDocumentType[];
  /** execute_ai_agent (ADR 020): ferramenta que encerra a execucao e criterio de concluir sem erro. */
  expectedResult?: AutomationExpectedResult;
  /** So em initial_petitions: o Flow monta o .docx (padrao) ou a rotina envia o arquivo. */
  documentGenerator?: AutomationDocumentGenerator;
  /** require_to_enter: o que o card precisa cumprir para entrar na coluna. */
  requirements?: EntryRequirement[];
}

export type AutomationExpectedResult = "comment" | "action_analysis" | "initial_petitions";
export type AutomationDocumentGenerator = "flow" | "ai";

/** Analise de Acoes (docs/product/flow-action-analysis-sprints.md, A1). */
export type ActionAnalysisBlock = "caixa" | "e" | "a" | "b" | "c" | "d";


export interface ActionAnalysisContractDto {
  number: string;
  status?: string;
  inclusionDate?: string;
  cardType?: "RMC" | "RCC";
  limit?: string;
}

export interface ActionAnalysisActionDto {
  id: string;
  block: ActionAnalysisBlock;
  position: number;
  bank: string;
  year: string | null;
  rootContract: string | null;
  observations: string | null;
  contracts: ActionAnalysisContractDto[];
}

export interface ActionAnalysisDto {
  id: string;
  cardId: string;
  status: "concluida" | "nao_concluida";
  failureReason: string | null;
  holderName: string | null;
  benefitNumber: string | null;
  statementDate: string | null;
  actionCount: number;
  createdAt: string;
  actions: ActionAnalysisActionDto[];
}

/**
 * Configuracao do gatilho, especifica por `triggerType`:
 * - `due_date_approaching`: `daysBefore` (inteiro >= 0).
 * - `card_stale`: `daysStale` (inteiro > 0).
 * - `column_entered` | `column_left` | `juridico_process_moved` | `djen_publication_received`: sem campos (objeto vazio).
 */
export interface ColumnAutomationTriggerConfigDto {
  daysBefore?: number;
  daysStale?: number;
}

export interface ColumnAutomationRuleDto {
  id: string;
  boardId: string;
  boardColumnId: string;
  triggerType: AutomationTriggerType;
  triggerConfig: ColumnAutomationTriggerConfigDto | null;
  actionType: AutomationActionType;
  /** Nulo em execute_ai_agent. */
  recipientRole: AutomationRecipientRole | null;
  actionConfig: ColumnAutomationActionConfigDto | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationKind = "card.assigned" | "card.commented" | "card.moved" | "card.document_rejected";

export interface NotificationDto {
  id: string;
  boardId: string;
  cardId: string;
  recipientIdentityId: string;
  actorIdentityId: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

// CRM de leads, Sprint 1 (docs/product/flow-crm-leads-sprints.md): cliente final
// titular do card. Dado do cliente so chega a quem o backend considera visivel.
export interface CardCustomerJuridicoDto {
  dataNascimento: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  rgNumero: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  nomeMae: string | null;
  numeroBeneficio: string | null;
  especieBeneficio: string | null;
  bancoPagamento: string | null;
  hipossuficienciaDeclarada: boolean;
  observacoes: string | null;
}

export interface CardCustomerDto {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  juridico: CardCustomerJuridicoDto | null;
}

export interface CardCustomerPanelDto {
  customer: CardCustomerDto | null;
  link: { createdByIdentityId: string; createdAt: string } | null;
  canEdit: boolean;
}

export type CardCustomerLinkOutcome = "created" | "linked" | "unchanged";

export interface CardCustomerLinkResultDto extends CardCustomerPanelDto {
  outcome: CardCustomerLinkOutcome;
}

/**
 * `outside_boards` nunca traz dado do cliente. `canOverride: true` so vem para o admin do
 * tenant (`flow:admin`), que pode vincular com motivo (`LinkCardCustomerPayload.override`).
 */
export type CardCustomerLookupResultDto =
  | { status: "not_found" }
  /**
   * `crossOffice` (Sprint 3.5): cliente visivel, mas sem card no escritorio deste card; o vinculo
   * exige o administrador com motivo (`canOverride` so para `flow:admin`).
   */
  | { status: "found"; customer: CardCustomerDto; crossOffice?: true; canOverride?: true }
  | { status: "outside_boards"; canOverride?: true };

/** Dado geral editavel pelo Flow (sem CPF e sem campos fiscais de PDV). Vazio = nao enviar. */
export interface CardCustomerCorePayload {
  name?: string;
  email?: string;
  phone?: string;
  addressZip?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
}

/** Patch juridico: ausente preserva, `null` limpa. */
export type CardCustomerJuridicoPayload = Partial<CardCustomerJuridicoDto>;

export interface LinkCardCustomerPayload {
  cpf: string;
  customer?: CardCustomerCorePayload & { name: string };
  juridico?: CardCustomerJuridicoPayload;
  /** Somente `flow:admin`, para cliente existente fora dos quadros. Motivo vai para historico e auditoria. */
  override?: { reason: string };
}

export interface UpdateCardCustomerPayload {
  customer?: CardCustomerCorePayload;
  juridico?: CardCustomerJuridicoPayload;
}

export const CUSTOMER_OUTSIDE_BOARDS_CODE = "customer_outside_boards";
export const OVERRIDE_NOT_ALLOWED_CODE = "override_not_allowed";
export const OVERRIDE_REQUIRES_EXISTING_CUSTOMER_CODE = "override_requires_existing_customer";
export const CROSS_OFFICE_LINK_REQUIRES_ADMIN_CODE = "cross_office_link_requires_admin";
export const CROSS_OFFICE_OVERRIDE_REQUIRED_CODE = "cross_office_override_required";

// ---------- Escritorios e visibilidade por escritorio (CRM de leads, Sprint 3.5) ----------
export const USER_WITHOUT_OFFICE_CODE = "user_without_office";
export const OFFICE_REQUIRED_CODE = "office_required";
export const OFFICE_NOT_ALLOWED_CODE = "office_not_allowed";
export const NO_ACTIVE_OFFICE_CODE = "no_active_office";
export const OFFICE_NAME_TAKEN_CODE = "office_name_taken";
export const IDENTITY_NOT_IN_CARD_OFFICE_CODE = "identity_not_in_card_office";

/** Sino do Flow: processos atualizados hoje (docs/product/flow-offices-sprints.md, S6). */
export interface MonitoringUpdateItemDto {
  cardId: string;
  boardId: string;
  /** Titulo do card = nome do cliente. */
  title: string;
  processNumber: string;
  updatedAt: string;
}

export interface MonitoringUpdatesTodayDto {
  date: string;
  total: number;
  datajud: { enabled: boolean; items: MonitoringUpdateItemDto[] };
  djen: { enabled: boolean; items: MonitoringUpdateItemDto[] };
}

/** Escritorio ativo do usuario (docs/product/flow-offices-sprints.md, S2/S3). */
export interface ActiveOfficeStateDto {
  activeOfficeId: string | null;
  offices: Array<{ id: string; name: string; isPrincipal: boolean }>;
  /** Escolhe o escritorio da ficha do cliente (`flow:admin` ou `flow:customers:offices`). */
  canChooseCustomerOffices: boolean;
}

export interface OfficeDto {
  id: string;
  name: string;
  active: boolean;
  /** Escritorio principal: no maximo um por cliente, sempre ativo (flow-offices-sprints.md, S1). */
  isPrincipal?: boolean;
}

/** Contrato de servicos do escritorio (docs/product/flow-office-service-contract-sprints.md). */
export interface ServiceContractVersionSummaryDto {
  version: number;
  /** html = editor Quill da Sprint 1 (so historico); docx = modelo do escritorio (Sprint 3). */
  format: "html" | "docx";
  fileName: string | null;
  sizeBytes: number | null;
  tags: string[];
  createdAt: string;
  createdByName: string | null;
}

export interface KitMarkDto {
  mark: string;
  count: number;
}

export interface ServiceContractVersionDto extends ServiceContractVersionSummaryDto {
  /** HTML ja limpo no servidor; so nas versoes html. */
  contentHtml: string | null;
  invalidTags: string[];
  blocks: string[];
  loanRowTags: string[];
  marks: { gender: KitMarkDto[]; plural: KitMarkDto[]; unrecognized: KitMarkDto[] } | null;
  warnings: Array<{ code: string; detail?: string }>;
}

export interface ServiceContractDto {
  officeId: string;
  officeName: string;
  current: ServiceContractVersionDto | null;
  versions: ServiceContractVersionSummaryDto[];
}

export interface UploadServiceContractResultDto extends ServiceContractDto {
  created: boolean;
}

export interface OfficeListItemDto extends OfficeDto {
  /** Local do fecho da peticao (S7 de docs/product/flow-initial-petitions-sprints.md); os dois juntos ou nenhum. */
  city: string | null;
  uf: string | null;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  cardCount: number;
}

/** Contexto do usuario: admin recebe todos os escritorios do tenant; demais, so os proprios. */
export interface OfficeContextDto {
  officeVisibilityEnabled: boolean;
  isAdmin: boolean;
  userOfficeIds: string[];
  offices: OfficeDto[];
}

export interface FlowUserManagementContextDto {
  officeAssignmentMode: "selectable" | "inherited";
  /** So `flow:admin` atribui mais de um escritorio; os demais escolhem um. */
  multipleOffices?: boolean;
  offices: Array<Pick<OfficeDto, "id" | "name">>;
}

export interface ProvisionFlowUserPayload {
  identity: {
    documentType: "cpf" | "cnpj";
    documentNumber: string;
    displayName: string;
    email?: string;
    phone?: string;
    password?: string;
  };
  officeIds?: string[];
}

export interface FlowUserProvisioningResultDto {
  commandId: string;
  state: "processing" | "completed" | "failed";
  identityId: string | null;
  officeIds: string[];
  errorCode: string | null;
}

/** Peticoes iniciais registradas pela rotina (ADR 020, S5 de docs/product/flow-initial-petitions-sprints.md). */
export interface InitialPetitionDocumentDto {
  documentId: string;
  version: number;
  /** uploaded_edit = versao corrigida enviada pela pessoa (S8). */
  origin: "routine_petition" | "uploaded_edit";
  status: "rascunho" | "aprovado" | "substituido";
  approvedAt: string | null;
  approvedByName: string | null;
  pdfStatus: string | null;
  sizeBytes: number;
}

export interface InitialPetitionDto {
  id: string;
  petitionKey: string;
  position: number;
  court: "jec" | "jef";
  bank: string;
  fileName: string;
  actionIds: string[];
  /** Preenchidos pela futura automacao de protocolo; com protocolo, a versao corrigida e recusada (S8). */
  protocolNumber: string | null;
  protocoledAt: string | null;
  /** Card criado no board de monitoramento pela acao Monitorar (Sprint 2 de flow-card-actions). */
  monitoringBoardId: string | null;
  monitoringCardId: string | null;
  document: InitialPetitionDocumentDto | null;
}

export interface InitialPetitionsLatestDto {
  run: InitialPetitionsRunDto | null;
  /** `board_admin` do board ou responsavel pelo card: registra o numero do processo (CNJ). */
  canRegisterProtocol: boolean;
}

/** Importacao de processos por planilha (docs/product/flow-process-import-sprints.md). */
export interface ProcessImportOptionsDto {
  boards: Array<{ id: string; name: string }>;
  offices: Array<{ id: string; name: string }>;
  /** Capacidade `monitoramento-processual` contratada pelo cliente (ADR 021). */
  monitoringEnabled: boolean;
  maxRows: number;
}

export interface ProcessImportPreviewRowDto {
  line: number;
  status: "ready" | "invalid" | "existing";
  processNumber: string | null;
  tribunal: string | null;
  problems: string[];
  warnings: string[];
  customer: "new" | "existing" | "unknown" | null;
  existingCardUrl: string | null;
}

export interface ProcessImportStatusDto {
  id: string;
  boardId: string;
  officeId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  createdCount: number;
  existingCount: number;
  failedCount: number;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
  rows: Array<{
    line: number;
    processNumber: string;
    status: "pending" | "created" | "existing" | "failed";
    cardUrl: string | null;
    existingCardUrl: string | null;
    skippedAssignees: number;
    errorCode: string | null;
  }>;
}

export interface ProcessImportRowInputDto {
  line: number;
  name: string;
  cpf: string;
  processNumber: string;
  state?: string;
  situation?: string;
}

/** Acao Monitorar: peticoes aprovadas com CNJ ainda nao enviadas e boards de destino. */
export interface PetitionMonitoringOptionsDto {
  petitions: Array<{ id: string; fileName: string; bank: string; court: "jec" | "jef"; processNumber: string }>;
  boards: Array<{ id: string; name: string }>;
  canCreateBoard: boolean;
  /** Capacidade `monitoramento-processual` contratada pelo cliente (ADR 021). */
  monitoringEnabled: boolean;
}

export interface PetitionMonitoringSentDto {
  sent: Array<{ petitionId: string; boardId: string; cardId: string; cardUrl: string; created: boolean }>;
}

export interface InitialPetitionsReportDto {
  excludedContracts: Array<{ contract: string; bank?: string; reason: string }>;
  pendingData: string[];
  courtsToCheck: string[];
  precedents: Array<{ processNumber: string; url: string; court?: string; theme?: string }>;
  themesWithoutStateRuling: string[];
  alerts: Array<{ kind: string; text: string }>;
  pendingDecisions: string[];
  actionsWithoutPetition: Array<{ actionId: string; reason: string }>;
}

export interface InitialPetitionsRunDto {
  id: string;
  generator: "flow" | "ai";
  status: "concluida" | "nao_concluida";
  failureReason: string | null;
  triageSource: "analysis" | "hiscon";
  actionAnalysisId: string | null;
  petitionCount: number;
  report: Partial<InitialPetitionsReportDto> | null;
  /** Pendencias do fecho montado pelo Flow (S7): o dado saiu XXXX. */
  closingGaps: InitialPetitionClosingGap[];
  /** Conclusao sem erro gravada; o card anda pelas regras de conclusao da IA da coluna. */
  completed: boolean;
  createdAt: string;
  petitions: InitialPetitionDto[];
}

export type InitialPetitionClosingGap = "card_without_office" | "office_without_city" | "no_assignee_lawyer_for_uf";

/** Versao corrigida enviada (S8): estado do card e avisos da conferencia do .docx. */
export interface CorrectedPetitionResultDto {
  run: InitialPetitionsRunDto | null;
  documentId: string;
  warnings: TemplateWarningDto[];
}

/** Advogado no cadastro do usuario do Flow (S7): nome para assinatura e uma OAB por UF. */
export interface UserOabDto {
  uf: string;
  number: string;
}

export interface UserLawyerDto {
  identityId: string;
  signatureName: string | null;
  oabs: UserOabDto[];
}

/** Acoes ja ajuizadas na ficha (ADR 020, S2 de docs/product/flow-initial-petitions-sprints.md). */
export interface PriorLawsuitDto {
  id: string;
  bank: string;
  /** NNNNNNN-DD.AAAA.J.TR.OOOO */
  processNumber: string;
  createdAt: string;
  createdByName: string | null;
}

export interface PriorLawsuitHistoryItemDto {
  kind: "lawsuit_added" | "lawsuit_removed" | "declared_none" | "declaration_revoked";
  at: string;
  byName: string | null;
  bank?: string;
  processNumber?: string;
  reason?: "lawsuit_added" | "withdrawn";
  /** Somente em declared_none: default = marcada pelo Flow no cadastro; manual = confirmada por uma pessoa. */
  origin?: "manual" | "default";
}

export interface PriorLawsuitsDto {
  customerId: string;
  /** listed: ha acoes; declared_none: sem acoes anteriores (padrao do cadastro ou confirmado); missing: nem lista nem confirmacao. */
  status: "listed" | "declared_none" | "missing";
  lawsuits: PriorLawsuitDto[];
  declaration: { declaredAt: string; declaredByName: string | null; origin: "manual" | "default" } | null;
  history: PriorLawsuitHistoryItemDto[];
}

export interface FlowCustomerJuridicoDto {
  dataNascimento?: string | null;
  nacionalidade?: string | null;
  estadoCivil?: string | null;
  profissao?: string | null;
  rgNumero?: string | null;
  rgOrgaoEmissor?: string | null;
  rgUf?: string | null;
  nomeMae?: string | null;
  numeroBeneficio?: string | null;
  especieBeneficio?: string | null;
  bancoPagamento?: string | null;
  hipossuficienciaDeclarada?: boolean;
  observacoes?: string | null;
}

export interface FlowCustomerSummaryDto {
  id: string;
  name: string;
  maskedDocumentNumber: string | null;
  status: "active" | "inactive";
  officeIds: string[];
  /** So na listagem: situacao da ficha para os alertas (ADR 017). */
  documentation?: CustomerDocumentationSummaryDto;
}

export interface CustomerDocumentationSummaryDto {
  status: CustomerValidationStatus;
  missingCount: number;
  latestVerdict: "aprovado" | "pendencias" | null;
}

export interface FlowCustomerDetailDto extends FlowCustomerSummaryDto {
  email: string | null;
  phone: string | null;
  juridico: FlowCustomerJuridicoDto | null;
}

export interface FlowCustomerWritePayload {
  name: string;
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  /** So quem escolhe o escritorio envia; os demais cadastram no escritorio ativo. */
  officeIds?: string[];
  juridico?: FlowCustomerJuridicoDto;
}

/** Catalogo fixo da ficha do cliente (ADR 017). */
export type CustomerDocumentType =
  | "identidade"
  | "cpf"
  | "comprovante_residencia"
  | "declaracao_residencia_terceiro"
  | "extrato_beneficio"
  | "promobank"
  | "hiscred";

export interface CustomerDocumentVersionDto {
  id: string;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByIdentityId: string;
  uploadedAt: string;
}

export interface CustomerDocumentProfileDto {
  /** Comprovante de residencia em nome de terceiro: exige a declaracao assinada. */
  residenceProofThirdParty: boolean;
  /** RG novo ou CNH ja trazem o CPF: dispensa o documento CPF. */
  cpfOnIdentity: boolean;
}

export interface CustomerDocumentsDto extends CustomerDocumentProfileDto {
  customerId: string;
  /** Todos os documentos exigidos enviados: libera "Validar dados". */
  complete: boolean;
  missing: CustomerDocumentType[];
  items: Array<{
    type: CustomerDocumentType;
    label: string;
    /** Exigido sozinho para validar; HISCON e Promobank valem pelo `oneOf`. */
    required: boolean;
    /** `extrato`: HISCON ou Promobank, um dos dois para validar. */
    oneOf: "extrato" | null;
    current: CustomerDocumentVersionDto | null;
    /** Ultimo parecer da IA sobre exatamente este arquivo; null se ainda nao foi lido. */
    review: CustomerDocumentReviewDto | null;
  }>;
}

export interface CustomerDocumentReviewDto {
  /** nao_conferido: o arquivo estava na ficha, mas nao foi liberado para a rotina (ADR 019). */
  outcome: "aprovado" | "recusado" | "nao_conferido";
  status: "ok" | "pendente" | "ilegivel" | "divergente" | null;
  note: string;
  answeredAt: string;
  confirmed: boolean;
}

export type CustomerValidationStatus =
  | "documentos_incompletos"
  | "em_validacao"
  | "aguardando_confirmacao"
  | "validado"
  | "nao_validado";

export interface CustomerIntakeAssigneesDto {
  assigned: Array<{ identityId: string; name: string | null }>;
  skipped: Array<{ identityId: string; name: string | null; reason: "not_board_member" | "not_in_card_office" }>;
  error?: "assign_failed";
}

export type CustomerKitResult = "generated" | "not_approved" | "no_model" | "model_not_docx" | "failed";

/** Kit gerado: arquivo, relatorio da montagem e envio ao Drive (download pelo bloco Documentos do card). */
export interface CustomerOfficeKitDto {
  id: string;
  fileName: string;
  report: { emptyTags?: string[]; unresolvedMarks?: string[]; warnings?: Array<{ code: string; detail?: string }> };
  /** pending, syncing, synced, failed; null = ainda sem fila (Drive desligado). */
  driveState: string | null;
  driveActive: boolean;
  createdAt: string;
}

export interface CustomerValidationRunDto {
  id: string;
  status: "dispatching" | "dispatched" | "answered" | "failed" | "expired";
  requestedByIdentityId: string;
  verdict: "aprovado" | "pendencias" | null;
  findings: Array<{ documentType: CustomerDocumentType; status: "ok" | "pendente" | "ilegivel" | "divergente"; note: string }> | null;
  summary: string | null;
  /** Campos da ficha que estavam vazios e foram preenchidos com os dados lidos pela IA. */
  appliedFields: string[];
  /** Documentos liberados para a rotina neste pedido; null = todos. */
  readableDocumentTypes: CustomerDocumentType[] | null;
  contractVersion: number | null;
  /** Valores do kit sugeridos pela IA (so com parecer aprovado, ADR 019). */
  tagValues: Record<string, string> | null;
  gender: KitGender | null;
  waiverCourt: KitWaiverCourt | null;
  generalFindings: string[] | null;
  alerts: string[] | null;
  /** Revisao humana dos valores; substitui a sugestao na geracao do kit. */
  review: KitReviewDto | null;
  reviewedAt: string | null;
  /** Card criado na confirmacao (ADR 019, decisao 16); null antes de confirmar. */
  intakeResult: CustomerIntakeResult | null;
  intakeBoardId: string | null;
  intakeCardId: string | null;
  /** Responsaveis do escritorio atribuidos ao card de entrada e os que ficaram de fora (com nome). */
  intakeAssignees: CustomerIntakeAssigneesDto | null;
  /** Kit do escritorio gerado na confirmacao (ADR 019, decisao 19); null antes de confirmar. */
  kitResult: CustomerKitResult | null;
  kitId: string | null;
  kit: CustomerOfficeKitDto | null;
  externalSessionUrl: string | null;
  errorCode: string | null;
  answeredAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  matchesCurrentDocuments: boolean;
}

export interface CustomerValidationStatusDto {
  customerId: string;
  status: CustomerValidationStatus;
  documentsComplete: boolean;
  missing: CustomerDocumentType[];
  /** Alguma rotina (do escritorio ou da conta principal) atende este cliente. */
  configured: boolean;
  /** Escritorios do cliente visiveis ao usuario e a conta que valida por cada um (ADR 018). */
  offices: CustomerValidationOfficeOptionDto[];
  runs: CustomerValidationRunDto[];
  /** Tags do modelo do kit usado no ultimo parecer; null sem modelo. */
  kitModel: { runId: string; officeId: string; officeName: string | null; version: number; tags: string[] } | null;
}

export type CustomerIntakeResult = "created" | "existing" | "no_office" | "no_board" | "no_backlog" | "failed";

export type KitGender = "masculino" | "feminino";
export type KitWaiverCourt = "jec" | "jef";

export interface KitReviewDto {
  values: Record<string, string>;
  gender: KitGender | null;
  waiverCourt: KitWaiverCourt | null;
}

export interface CustomerValidationOfficeOptionDto {
  id: string;
  name: string;
  /** office = rotina do escritorio; central = conta principal; none = sem rotina. */
  route: "office" | "central" | "none";
}

export interface CustomerValidationOfficeSettingsDto {
  officeId: string;
  officeName: string;
  active: boolean;
  isPrincipal: boolean;
  /** Admin ou responsavel do escritorio com `ai:agents:manage` (S4). */
  canEdit: boolean;
  agentId: string | null;
  agentOwnerIsCurrentUser: boolean;
  updatedAt: string | null;
  /** Board onde nasce o card do cliente confirmado (coluna BACKLOG). */
  intakeBoardId: string | null;
  responsibles: Array<{ identityId: string; displayName: string | null }>;
}

export interface CustomerValidationSettingsDto {
  /** Reserva da validacao = escritorio principal (flow-offices-sprints.md, S1). */
  principalOfficeId: string | null;
  /** Quem pode alterar o agente do principal (S4). */
  canEditPrincipal: boolean;
  /** Politica de documentos e board de entrada: so admin. */
  isAdmin: boolean;
  principalOfficeName: string | null;
  agentId: string | null;
  executorIdentityId: string | null;
  executorIsCurrentUser: boolean;
  updatedAt: string | null;
  /** Documentos que a rotina de validacao pode ler (ADR 019). */
  readableDocumentTypes: CustomerDocumentType[];
  /** Boards ativos para o "Board de entrada" de cada escritorio. */
  boards: Array<{ id: string; name: string }>;
  offices: CustomerValidationOfficeSettingsDto[];
}

export interface FlowCustomerCardDto {
  id: string;
  boardId: string;
  boardColumnId: string;
  officeId: string | null;
  title: string;
  status: string;
}

export type DriveConfigurationStatus = "inactive" | "active" | "paused" | "invalid";

export interface DriveConfigurationDto {
  status: DriveConfigurationStatus;
  connected: boolean;
  accountEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  lastErrorCode: string | null;
}

export interface DrivePickerTokenDto {
  accessToken: string;
  expiresIn: number;
  apiKey: string;
  appId: string;
}

export type EmailDispatchStatus = "pending" | "processing" | "sent" | "skipped" | "failed";
export type EmailDispatchFilter = "failed" | "pending";

/** Outbox das automacoes de e-mail (Sprint 13): resumo do tenant + linhas de cards visiveis. */
export interface EmailDispatchListDto {
  summary: { pending: number; processing: number; failed: number; oldestPendingAt: string | null };
  maxAttempts: number;
  items: Array<{
    id: string;
    status: EmailDispatchStatus;
    attemptCount: number;
    lastError: string | null;
    nextAttemptAt: string;
    createdAt: string;
    updatedAt: string;
    boardId: string;
    boardName: string;
    columnName: string;
    cardId: string;
    cardTitle: string;
    triggerType: AutomationTriggerType;
  }>;
}

export interface OfficeUserDto {
  identityId: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  officeIds: string[];
  /** Escritorios em que o usuario e responsavel (conecta a conta Claude do escritorio). */
  responsibleOfficeIds: string[];
}

export interface RemovedAssignmentDto {
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
  officeId: string;
}

export interface ReplaceUserOfficesResultDto {
  identityId: string;
  officeIds: string[];
  added: string[];
  removed: string[];
  removedAssignments: RemovedAssignmentDto[];
  /** Responsavel marcado: permissoes de IA concedidas no Identity (false = conceder pela tela de usuarios). */
  aiPermissionsGranted?: boolean | null;
}

export interface OfficeSettingsDto {
  officeVisibilityEnabled: boolean;
  enabledAt: string | null;
  enabledByIdentityId: string | null;
  activeOfficeCount: number;
  cardsWithoutOffice: { total: number; byBoard: Array<{ boardId: string; boardName: string; count: number }> };
  usersWithoutOffice: Array<{ identityId: string; displayName: string | null }>;
}

export interface TransferCardOfficeResultDto {
  cardId: string;
  fromOfficeId: string | null;
  officeId: string;
  changed: boolean;
}

export interface AssigneeCandidateDto {
  identityId: string;
  role: BoardMemberRole;
  displayName: string | null;
}

// CRM de leads, Sprint 2: checklist de documentos por quadro e revisao pela central.
export interface BoardDocumentTypeDto {
  id: string;
  boardId: string;
  name: string;
  required: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyInitialDocumentTypesResultDto {
  created: BoardDocumentTypeDto[];
  skippedNames: string[];
  data: BoardDocumentTypeDto[];
}

export type CardDocumentStatus = "enviado" | "aceito" | "rejeitado";
export type ChecklistItemState = "pendente" | CardDocumentStatus;

export interface CardDocumentDto {
  id: string;
  cardId: string;
  documentTypeId: string;
  status: CardDocumentStatus;
  rejectionReason: string | null;
  reviewedByIdentityId: string | null;
  reviewedAt: string | null;
  createdByIdentityId: string;
  createdAt: string;
  attachment: { id: string; activityId: string; fileName: string; contentType: string; sizeBytes: number };
}

export interface CardChecklistItemDto {
  documentTypeId: string;
  name: string;
  required: boolean;
  sortOrder: number;
  active: boolean;
  state: ChecklistItemState;
  current: CardDocumentDto | null;
  history: CardDocumentDto[];
}

/** Documento avulso do bloco Documentos (docs/product/flow-card-extra-documents-sprints.md, D1). */
export interface CardExtraDocumentDto {
  id: string;
  description: string | null;
  createdByIdentityId: string;
  createdAt: string;
  attachment: { id: string; activityId: string; fileName: string; contentType: string; sizeBytes: number };
  canRemove: boolean;
}

export interface CardExtraDocumentsDto {
  documents: CardExtraDocumentDto[];
  canUpload: boolean;
}

/** HISCON do cliente no painel Cliente do card (docs/product/flow-customer-promobank-sprints.md). */
export interface CardHisconDto {
  customerId: string | null;
  missing: boolean;
  canUpload: boolean;
}

export const COLUMN_REQUIREMENTS_UNMET_CODE = "column_requirements_unmet";

/** Kit assinado e Validador de assinatura no card (docs/product/flow-signed-kit-sprints.md, S2). */
export type SignatureVerdict = "aprovado" | "pendencias";
export interface SignatureFindingDto {
  item: string;
  status: "ok" | "pendente" | "ilegivel" | "divergente";
  note: string;
}
export interface CardSignatureDto {
  kitId: string | null;
  signed: { id: string; version: number; fileName: string; contentType: string; sizeBytes: number; createdAt: string } | null;
  validation: {
    id: string;
    status: "dispatching" | "dispatched" | "answered" | "failed" | "expired";
    errorCode: string | null;
    verdict: SignatureVerdict | null;
    summary: string | null;
    findings: SignatureFindingDto[];
    answeredAt: string | null;
    confirmedAt: string | null;
    current: boolean;
  } | null;
  approved: boolean;
  canUpload: boolean;
  canConfirm: boolean;
}

/** Kit do escritorio mais recente do cliente do card (ADR 019, decisao 19). */
export interface CardOfficeKitDto {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  /** E-mail do kit ao cliente (S4 de flow-signed-kit-sprints.md); null sem envio. */
  email?: { status: "pending" | "sending" | "sent" | "failed"; to: string; sentAt: string | null } | null;
}

export interface OfficeKitEmailSettingsDto {
  officeId: string;
  enabled: boolean;
  subject: string;
  body: string;
  updatedAt: string | null;
}

export interface CardChecklistDto {
  items: CardChecklistItemDto[];
  completeness: { acceptedRequired: number; totalRequired: number; complete: boolean };
  /** Mesma regra de `CardDto.checklistPending`, para o card aberto no modal. */
  checklistPending: boolean;
  canUpload: boolean;
  canReview: boolean;
}

export type ReviewCardDocumentPayload =
  | { status: "aceito" }
  | { status: "rejeitado"; rejectionReason: string };

export const CHECKLIST_INCOMPLETE_CODE = "checklist_incomplete";
/** 415 do upload (anexo e documento): conteudo nao condiz com o tipo declarado (assinatura do arquivo). */
export const CONTENT_SIGNATURE_MISMATCH_CODE = "content_signature_mismatch";

// ---------------------------------------------------------------- CRM de leads, Sprint 4
// Contrato: docs/api/flow-crm-leads-sprint-4-openapi.yaml.

export type LeadStatus =
  | "rascunho"
  | "enviado"
  | "em_processamento"
  | "aguardando_revisao"
  | "aprovado"
  | "devolvido"
  | "falha_processamento";

export interface LeadPendingDocumentDto {
  id: string;
  name: string;
  state: "pendente" | "rejeitado";
}

export interface LeadReadinessDto {
  complete: boolean;
  customerLinked: boolean;
  /** Chaves do catalogo de campos (`lib/leads.ts` traduz). */
  missingFields: string[];
  pendingDocumentTypes: LeadPendingDocumentDto[];
}

export interface LeadSubmissionDto {
  id: string;
  officeId: string | null;
  submittedByIdentityId: string;
  submittedByName: string | null;
  submittedAt: string;
  returnedByIdentityId: string | null;
  returnedByName: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}

export interface CardLeadDto {
  cardId: string;
  status: LeadStatus;
  leadIntakeEnabled: boolean;
  /** `false` = congelado ate a devolucao (P21). */
  editable: boolean;
  canSubmit: boolean;
  canReturn: boolean;
  readiness: LeadReadinessDto | null;
  currentSubmission: LeadSubmissionDto | null;
  customerSnapshot: { outdated: boolean; changedFields: string[]; customerChanged: boolean } | null;
  history: LeadSubmissionDto[];
}

export interface LeadQueueItemDto {
  cardId: string;
  boardId: string;
  boardName: string;
  cardTitle: string;
  officeId: string | null;
  officeName: string | null;
  status: LeadStatus;
  submissionId: string | null;
  submittedByIdentityId: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}

export interface LeadQueueFilters {
  officeId?: string;
  boardId?: string;
  status?: LeadStatus;
  submittedFrom?: string;
  submittedTo?: string;
  limit: number;
  offset: number;
}

export interface LeadSettingsDto {
  requiredFields: string[];
  configured: boolean;
  configuredAt: string | null;
  availableFields: string[];
  defaultRequiredFields: string[];
}

// Analise do lead e documento gerado (CRM de leads, Sprint 6).
// Contrato: docs/api/flow-crm-leads-sprint-6-openapi.yaml. `analysis` so `flow:admin`;
// `leads.documents` (documentos ENTREGUES) para quem ve o card (P11).
export type GeneratedDocumentStatus = "rascunho" | "aprovado" | "substituido";
export type GeneratedDocumentOrigin = "generated" | "uploaded_edit";
export type DocumentPdfStatus = "pending" | "done" | "failed";
export type DocumentFormat = "docx" | "pdf";
export type VariableOrigin = "cadastro_enviado" | "escritorio" | "lead" | "caso" | "sistema";

export interface DocumentPdfStateDto {
  status: DocumentPdfStatus;
  attempts: number;
  errorCode: string | null;
  completedAt: string | null;
}

export interface GeneratedDocumentDto {
  id: string;
  caseId: string;
  version: number;
  origin: GeneratedDocumentOrigin;
  status: GeneratedDocumentStatus;
  basedOnDocumentId: string | null;
  templateId: string;
  templateName: string;
  templateVersionId: string;
  templateVersion: number;
  templateSha256: string;
  catalogVersion: number;
  sizeBytes: number;
  createdByIdentityId: string;
  createdByName: string | null;
  createdAt: string;
  approvedByIdentityId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  pdf: DocumentPdfStateDto | null;
  missingOptional: string[];
  variables: Array<{ key: string; label: string; origin: VariableOrigin; required: boolean; filled: boolean }>;
}

export interface LeadCaseDto {
  id: string;
  caseTypeId: string;
  caseTypeName: string;
  caseTypeActive: boolean;
  source: "manual" | "ai";
  decidedByIdentityId: string;
  decidedByName: string | null;
  decidedAt: string;
  replacesCaseId: string | null;
  supersededAt: string | null;
  supersededByName: string | null;
  supersededReason: string | null;
  /** Mais nova primeiro. */
  documents: GeneratedDocumentDto[];
}

export interface AnalysisTemplateOptionDto {
  id: string;
  name: string;
  isDefault: boolean;
  usable: boolean;
  unusableReason: "template_inactive" | "template_without_version" | "template_version_not_usable" | null;
}

export interface AnalysisCaseTypeOptionDto {
  id: string;
  name: string;
  templates: AnalysisTemplateOptionDto[];
}

export interface LeadAnalysisDto {
  cardId: string;
  leadStatus: LeadStatus;
  submissionId: string | null;
  analysisOpen: boolean;
  caseTypes: AnalysisCaseTypeOptionDto[];
  cases: LeadCaseDto[];
  removedCases: LeadCaseDto[];
}

export interface EditedVersionResultDto {
  analysis: LeadAnalysisDto;
  documentId: string;
  warnings: TemplateWarningDto[];
}

export interface DeliveredDocumentDto {
  id: string;
  title: string;
  version: number;
  editedByManager: boolean;
  approvedAt: string;
  pdfStatus: "ready" | "pending";
}

export interface LeadDeliveredDocumentsDto {
  cardId: string;
  leadStatus: LeadStatus;
  documents: DeliveredDocumentDto[];
}

export interface GeneratedDocumentDownloadDto {
  url: string;
  expiresAt: string;
  fileName: string;
}

// Tipos de caso e modelos de documento (CRM de leads, Sprint 5). Somente `flow:admin`.
// Contrato: docs/api/flow-crm-leads-sprint-5-openapi.yaml.
export interface CaseTypeDto {
  id: string;
  name: string;
  description: string | null;
  classificationCriteria: string | null;
  expectedEvidence: string | null;
  active: boolean;
  defaultTemplateId: string | null;
  templates: Array<{ id: string; name: string; active: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTypePayload {
  name: string;
  description: string | null;
  classificationCriteria: string | null;
  expectedEvidence: string | null;
  templateIds: string[];
  defaultTemplateId: string | null;
}

export type TemplateVersionStatus = "valid" | "invalid_variables";
export type TemplateValueType = "text" | "boolean" | "collection";

export interface TemplateVersionSummaryDto {
  id: string;
  version: number;
  validationStatus: TemplateVersionStatus;
  createdAt: string;
}

export interface DocumentTemplateDto {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  currentVersion: TemplateVersionSummaryDto | null;
  caseTypeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateWarningDto {
  code: "possible_malformed_tag" | "attached_template_external" | string;
  detail?: string;
}

export interface TemplateVersionDto {
  id: string;
  templateId: string;
  version: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  catalogVersion: number;
  validationStatus: TemplateVersionStatus;
  usableForGeneration: boolean;
  isCurrent: boolean;
  unknownVariables: string[];
  warnings: TemplateWarningDto[];
  uploadedByIdentityId: string;
  createdAt: string;
}

export interface TemplateVariableDto {
  key: string;
  known: boolean;
  valueType: TemplateValueType | null;
  label: string | null;
  required: boolean;
}

export interface TemplateVersionDetailDto extends TemplateVersionDto {
  variables: TemplateVariableDto[];
}

export interface DocumentTemplateDetailDto extends DocumentTemplateDto {
  versions: TemplateVersionDto[];
  current: TemplateVersionDetailDto | null;
  caseTypes: Array<{ id: string; name: string; active: boolean; isDefault: boolean }>;
}

export interface TemplateCatalogVariableDto {
  key: string;
  label: string;
  description: string;
  valueType: TemplateValueType;
  source: string;
  usage: string;
  example: string | boolean | null;
  items?: Array<{ key: string; label: string; description: string; example: string | null }>;
}

export interface TemplateCatalogDto {
  catalogVersion: number;
  delimiters: { start: string; end: string };
  namespaces: Array<{ key: string; label: string; description: string; variables: TemplateCatalogVariableDto[] }>;
}

export function toQueryString(filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const kanbanApi = {
  actions: {
    list: (boardId: string) => request<BoardActionsDto>(`/kanban/boards/${boardId}/actions`),
    replace: (boardId: string, columnId: string, actionIds: string[], configs: ColumnActionConfigInput[] = []) =>
      request<void>(`/kanban/boards/${boardId}/columns/${columnId}/actions`, {
        method: "PUT", body: JSON.stringify(configs.length ? { actionIds, configs } : { actionIds }),
      }),
    execute: (boardId: string, cardId: string, actionId: string) =>
      request<CardActionResultDto>(`/kanban/boards/${boardId}/cards/${cardId}/actions/${encodeURIComponent(actionId)}/execute`, { method: "POST" }),
  },
  boards: {
    list: (search?: string) =>
      request<{ data: BoardDto[]; meta: PageMeta }>(
        `/kanban/boards${search ? `?search=${encodeURIComponent(search)}` : ""}`
      ),
    get: (boardId: string) => request<BoardDto>(`/kanban/boards/${boardId}`),
    create: (body: { name: string; description?: string | null }) =>
      request<BoardDto>("/kanban/boards", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    // Sprint 4: liga/desliga a captacao de leads no quadro (flow:admin).
    update: (boardId: string, body: Partial<{ name: string; description: string | null; leadIntakeEnabled: boolean }>) =>
      request<BoardDto>(`/kanban/boards/${boardId}`, { method: "PATCH", body: JSON.stringify(body) }),
    archive: (boardId: string) =>
      request<void>(`/kanban/boards/${boardId}`, { method: "DELETE" }),
  },
  columns: {
    list: (boardId: string) =>
      request<{ data: BoardColumnDto[]; meta: PageMeta }>(
        `/kanban/boards/${boardId}/columns`
      ),
    create: (
      boardId: string,
      body: { name: string; position: number; color?: string | null; wipLimit?: number | null; requiresCompleteChecklist?: boolean }
    ) =>
      request<BoardColumnDto>(`/kanban/boards/${boardId}/columns`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      boardId: string,
      columnId: string,
      body: Partial<{
        name: string;
        position: number;
        color: string | null;
        wipLimit: number | null;
        status: ResourceStatus;
        requiresCompleteChecklist: boolean;
      }>
    ) =>
      request<BoardColumnDto>(`/kanban/boards/${boardId}/columns/${columnId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    archive: (boardId: string, columnId: string) =>
      request<void>(`/kanban/boards/${boardId}/columns/${columnId}`, { method: "DELETE" }),
  },
  cards: {
    list: (boardId: string, filters: { search?: string; cardStatusId?: string; tagId?: string } = {}) =>
      request<{ data: CardDto[]; meta: PageMeta }>(
        `/kanban/boards/${boardId}/cards${toQueryString({ limit: "100", ...filters })}`
      ),
    create: (
      boardId: string,
      body: { boardColumnId: string; title: string; description?: string | null; dueDate?: string | null; officeId?: string }
    ) =>
      request<CardDto>(`/kanban/boards/${boardId}/cards`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (boardId: string, cardId: string, body: Partial<{ title: string; description: string | null; status: ResourceStatus; dueDate: string | null }>) =>
      request<CardDto>(`/kanban/boards/${boardId}/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    // Arquivar e um soft-remove (sai do board); usa o update generico, nao o DELETE.
    // DELETE agora significa exclusao definitiva e so e aceito sobre um card ja arquivado.
    archive: (boardId: string, cardId: string) =>
      request<CardDto>(`/kanban/boards/${boardId}/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      }),
    /** Exclusão lógica: o card sai das listagens e permanece no banco. */
    remove: (boardId: string, cardId: string) =>
      request<void>(`/kanban/boards/${boardId}/cards/${cardId}`, { method: "DELETE" }),
    move: (boardId: string, cardId: string, body: { toBoardColumnId: string; toPosition: number }) =>
      request<CardDto>(`/kanban/boards/${boardId}/cards/${cardId}/move`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    setStatus: (boardId: string, cardId: string, cardStatusId: string | null) =>
      request<CardDto>(`/kanban/boards/${boardId}/cards/${cardId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ cardStatusId }),
      }),
  },
  sourceMonitoring: {
    get: (cardId: string) =>
      request<CardMonitoringDto>(`/domain-integrations/flow/cards/${cardId}/monitoramento`),
    set: (cardId: string, monitor: boolean) =>
      request<Pick<CardMonitoringDto, "monitoring" | "monitorId">>(
        `/domain-integrations/flow/cards/${cardId}/monitoramento`,
        { method: "POST", body: JSON.stringify({ monitor }) }
      ),
    updateCadence: (cardId: string, cadence: DataJudMonitorCadence) =>
      request<Required<Pick<CardMonitoringDto, "monitoring" | "monitorId" | "cadence">>>(
        `/domain-integrations/flow/cards/${cardId}/monitoramento/cadencia`,
        { method: "PATCH", body: JSON.stringify({ cadence }) }
      ),
    movements: (cardId: string) =>
      request<{ items: CardProcessMovementDto[] }>(`/domain-integrations/flow/cards/${cardId}/monitoramento/movimentacoes`),
    lookupMovementPublications: (cardId: string, movementId: string) =>
      request<{ from: string; to: string; items: CardPublicationDto[] }>(
        `/domain-integrations/flow/cards/${cardId}/monitoramento/movimentacoes/${movementId}/djen`,
        { method: "POST" }
      ),
    publications: (cardId: string) =>
      request<{ items: CardPublicationDto[] }>(`/domain-integrations/flow/cards/${cardId}/monitoramento/publicacoes`),
    setDjen: (cardId: string, enabled: boolean) =>
      request<CardDjenDto>(`/domain-integrations/flow/cards/${cardId}/monitoramento/djen`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    updateDjenCadence: (cardId: string, days: DjenCadenceDays) =>
      request<CardDjenDto>(`/domain-integrations/flow/cards/${cardId}/monitoramento/djen/cadencia`, {
        method: "PATCH",
        body: JSON.stringify({ days }),
      }),
  },
  processImports: {
    options: () => request<ProcessImportOptionsDto>("/domain-integrations/flow/process-imports/options"),
    preview: (body: { boardId: string; officeId: string; rows: ProcessImportRowInputDto[] }) =>
      request<{ rows: ProcessImportPreviewRowDto[] }>("/domain-integrations/flow/process-imports/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    create: (body: { boardId: string; officeId: string; rows: ProcessImportRowInputDto[] }) =>
      request<{ importId: string; queued: boolean; totalRows: number }>("/domain-integrations/flow/process-imports", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    status: (importId: string) => request<ProcessImportStatusDto>(`/domain-integrations/flow/process-imports/${importId}`),
    resume: (importId: string) =>
      request<{ queued: boolean }>(`/domain-integrations/flow/process-imports/${importId}/resume`, { method: "POST" }),
  },
  petitionMonitoring: {
    options: (cardId: string) =>
      request<PetitionMonitoringOptionsDto>(`/domain-integrations/flow/cards/${cardId}/peticoes/monitoramento`),
    send: (cardId: string, petitionIds: string[], targetBoardId: string) =>
      request<PetitionMonitoringSentDto>(`/domain-integrations/flow/cards/${cardId}/peticoes/monitoramento`, {
        method: "POST",
        body: JSON.stringify({ petitionIds, targetBoardId }),
      }),
  },
  members: {
    list: (boardId: string) =>
      request<{ data: BoardMemberDto[]; meta: PageMeta }>(`/kanban/boards/${boardId}/members`),
    candidates: (boardId: string) =>
      request<IdentityCandidateDto[]>(`/kanban/boards/${boardId}/members/candidates`),
    create: (boardId: string, body: { identityId: string; role: BoardMemberRole }) =>
      request<BoardMemberDto>(`/kanban/boards/${boardId}/members`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (boardId: string, memberId: string, body: Partial<{ role: BoardMemberRole; status: "active" | "inactive" }>) =>
      request<BoardMemberDto>(`/kanban/boards/${boardId}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (boardId: string, memberId: string) =>
      request<void>(`/kanban/boards/${boardId}/members/${memberId}`, { method: "DELETE" }),
    assignProfile: (boardId: string, memberId: string, profileId: string | null) =>
      request<BoardMemberDto>(`/kanban/boards/${boardId}/members/${memberId}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ profileId }),
      }),
  },
  profiles: {
    list: (boardId: string) =>
      request<{ data: MemberProfileDto[]; meta: PageMeta }>(`/kanban/boards/${boardId}/profiles?limit=100`),
    create: (
      boardId: string,
      body: {
        name: string;
        canDeleteArchivedCards?: boolean;
        canManageTags?: boolean;
        canManageStatuses?: boolean;
        canReviewDocuments?: boolean;
      }
    ) =>
      request<MemberProfileDto>(`/kanban/boards/${boardId}/profiles`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      boardId: string,
      profileId: string,
      body: Partial<{
        name: string;
        canDeleteArchivedCards: boolean;
        canManageTags: boolean;
        canManageStatuses: boolean;
        canReviewDocuments: boolean;
      }>
    ) =>
      request<MemberProfileDto>(`/kanban/boards/${boardId}/profiles/${profileId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (boardId: string, profileId: string) =>
      request<void>(`/kanban/boards/${boardId}/profiles/${profileId}`, { method: "DELETE" }),
    listTransitions: (boardId: string, profileId: string) =>
      request<MemberProfileTransitionDto[]>(`/kanban/boards/${boardId}/profiles/${profileId}/transitions`),
    replaceTransitions: (
      boardId: string,
      profileId: string,
      transitions: Array<{ fromBoardColumnId: string; toBoardColumnId: string }>
    ) =>
      request<MemberProfileTransitionDto[]>(`/kanban/boards/${boardId}/profiles/${profileId}/transitions`, {
        method: "PUT",
        body: JSON.stringify({ transitions }),
      }),
    listColumnPermissions: (boardId: string, profileId: string) =>
      request<BoardColumnPermissionDto[]>(`/kanban/boards/${boardId}/profiles/${profileId}/column-permissions`),
    replaceColumnPermissions: (
      boardId: string,
      profileId: string,
      permissions: Array<{ boardColumnId: string; canView: boolean; canEdit: boolean }>
    ) =>
      request<BoardColumnPermissionDto[]>(`/kanban/boards/${boardId}/profiles/${profileId}/column-permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      }),
  },
  assignees: {
    list: (boardId: string, cardId: string) =>
      request<CardAssigneeDto[]>(`/kanban/boards/${boardId}/cards/${cardId}/assignees`),
    create: (boardId: string, cardId: string, identityId: string) =>
      request<CardAssigneeDto>(`/kanban/boards/${boardId}/cards/${cardId}/assignees`, {
        method: "POST",
        body: JSON.stringify({ identityId }),
      }),
    remove: (boardId: string, cardId: string, identityId: string) =>
      request<void>(`/kanban/boards/${boardId}/cards/${cardId}/assignees/${identityId}`, { method: "DELETE" }),
    /** Membros ativos que veem o card (Sprint 3.5: escritorio do card, ou administrador). */
    candidates: (boardId: string, cardId: string) =>
      request<AssigneeCandidateDto[]>(`/kanban/boards/${boardId}/cards/${cardId}/assignees/candidates`),
  },
  activities: {
    list: (boardId: string, cardId: string) =>
      request<{ data: CardActivityDto[]; meta: PageMeta }>(
        `/kanban/boards/${boardId}/cards/${cardId}/activities?limit=100`
      ),
    createComment: (boardId: string, cardId: string, textContent: string) =>
      request<CardActivityDto>(`/kanban/boards/${boardId}/cards/${cardId}/activities`, {
        method: "POST",
        body: JSON.stringify({ textContent }),
      }),
  },
  attachments: {
    list: (boardId: string, cardId: string, activityId: string) =>
      request<CardAttachmentDto[]>(
        `/kanban/boards/${boardId}/cards/${cardId}/activities/${activityId}/attachments`
      ),
    upload: (boardId: string, cardId: string, activityId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<CardAttachmentDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/activities/${activityId}/attachments`,
        formData
      );
    },
    getDownloadUrl: (boardId: string, cardId: string, activityId: string, attachmentId: string) =>
      request<AttachmentDownloadUrlDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/activities/${activityId}/attachments/${attachmentId}/download`
      ),
  },
  tags: {
    list: (boardId: string) =>
      request<{ data: CardTagDto[]; meta: PageMeta }>(`/kanban/boards/${boardId}/tags?limit=100`),
    create: (boardId: string, body: { name: string; color?: string }) =>
      request<CardTagDto>(`/kanban/boards/${boardId}/tags`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (boardId: string, tagId: string, body: Partial<{ name: string; color: string }>) =>
      request<CardTagDto>(`/kanban/boards/${boardId}/tags/${tagId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (boardId: string, tagId: string) =>
      request<void>(`/kanban/boards/${boardId}/tags/${tagId}`, { method: "DELETE" }),
    listForCard: (boardId: string, cardId: string) =>
      request<CardTagDto[]>(`/kanban/boards/${boardId}/cards/${cardId}/tags`),
    attachToCard: (boardId: string, cardId: string, tagId: string) =>
      request<void>(`/kanban/boards/${boardId}/cards/${cardId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tagId }),
      }),
    detachFromCard: (boardId: string, cardId: string, tagId: string) =>
      request<void>(`/kanban/boards/${boardId}/cards/${cardId}/tags/${tagId}`, { method: "DELETE" }),
  },
  statuses: {
    list: (boardId: string) =>
      request<{ data: CardStatusDto[]; meta: PageMeta }>(`/kanban/boards/${boardId}/statuses?limit=100`),
    create: (boardId: string, body: { name: string; color?: string }) =>
      request<CardStatusDto>(`/kanban/boards/${boardId}/statuses`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (boardId: string, statusId: string, body: Partial<{ name: string; color: string }>) =>
      request<CardStatusDto>(`/kanban/boards/${boardId}/statuses/${statusId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (boardId: string, statusId: string) =>
      request<void>(`/kanban/boards/${boardId}/statuses/${statusId}`, { method: "DELETE" }),
  },
  metrics: {
    get: (filters: MetricsFilters = {}) => request<MetricsDto>(`/kanban/metrics${toQueryString({ ...filters })}`),
  },
  automationRules: {
    list: (boardId: string, columnId: string) =>
      request<ColumnAutomationRuleDto[]>(`/kanban/boards/${boardId}/columns/${columnId}/automation-rules`),
    create: (
      boardId: string,
      columnId: string,
      body: {
        triggerType: AutomationTriggerType;
        triggerConfig?: ColumnAutomationTriggerConfigDto;
        actionType: AutomationActionType;
        recipientRole?: AutomationRecipientRole;
        actionConfig?: ColumnAutomationActionConfigDto;
        isActive?: boolean;
      }
    ) =>
      request<ColumnAutomationRuleDto>(`/kanban/boards/${boardId}/columns/${columnId}/automation-rules`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      boardId: string,
      columnId: string,
      ruleId: string,
      body: Partial<{
        triggerType: AutomationTriggerType;
        actionType: AutomationActionType;
        triggerConfig: ColumnAutomationTriggerConfigDto;
        recipientRole: AutomationRecipientRole;
        actionConfig: ColumnAutomationActionConfigDto;
        isActive: boolean;
      }>
    ) =>
      request<ColumnAutomationRuleDto>(`/kanban/boards/${boardId}/columns/${columnId}/automation-rules/${ruleId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (boardId: string, columnId: string, ruleId: string) =>
      request<void>(`/kanban/boards/${boardId}/columns/${columnId}/automation-rules/${ruleId}`, {
        method: "DELETE",
      }),
  },
  notifications: {
    list: (unreadOnly = false) =>
      request<NotificationDto[]>(`/kanban/notifications${unreadOnly ? "?unreadOnly=true" : ""}`),
    markRead: (notificationId: string) =>
      request<void>(`/kanban/notifications/${notificationId}/read`, { method: "PATCH" }),
    markAllRead: () => request<void>("/kanban/notifications/read-all", { method: "PATCH" }),
  },
  // CPF vai sempre no corpo (POST/PUT), nunca em URL.
  cardCustomer: {
    get: (boardId: string, cardId: string) =>
      request<CardCustomerPanelDto>(`/kanban/boards/${boardId}/cards/${cardId}/customer`),
    lookup: (boardId: string, cardId: string, cpf: string) =>
      request<CardCustomerLookupResultDto>(`/kanban/boards/${boardId}/cards/${cardId}/customer/lookup`, {
        method: "POST",
        body: JSON.stringify({ cpf }),
      }),
    link: (boardId: string, cardId: string, payload: LinkCardCustomerPayload) =>
      request<CardCustomerLinkResultDto>(`/kanban/boards/${boardId}/cards/${cardId}/customer`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    update: (boardId: string, cardId: string, payload: UpdateCardCustomerPayload) =>
      request<CardCustomerPanelDto>(`/kanban/boards/${boardId}/cards/${cardId}/customer`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },
  // Configuracao do checklist por quadro (board_admin). Desativar = update { active: false }.
  documentTypes: {
    list: (boardId: string) =>
      request<{ data: BoardDocumentTypeDto[] }>(`/kanban/boards/${boardId}/document-types`),
    create: (boardId: string, body: { name: string; required?: boolean; sortOrder?: number }) =>
      request<BoardDocumentTypeDto>(`/kanban/boards/${boardId}/document-types`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      boardId: string,
      documentTypeId: string,
      body: Partial<{ name: string; required: boolean; sortOrder: number; active: boolean }>
    ) =>
      request<BoardDocumentTypeDto>(`/kanban/boards/${boardId}/document-types/${documentTypeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    applyInitialList: (boardId: string) =>
      request<ApplyInitialDocumentTypesResultDto>(`/kanban/boards/${boardId}/document-types/apply-initial-list`, {
        method: "POST",
      }),
  },
  // Escritorios (Sprint 3.5). `context` e de todo usuario do Flow; o resto exige `flow:admin`.
  offices: {
    kitEmail: (officeId: string) => request<OfficeKitEmailSettingsDto>(`/kanban/offices/${officeId}/kit-email`),
    saveKitEmail: (officeId: string, body: { enabled: boolean; subject: string; body: string }) =>
      request<OfficeKitEmailSettingsDto>(`/kanban/offices/${officeId}/kit-email`, { method: "PUT", body: JSON.stringify(body) }),
    context: () => request<OfficeContextDto>("/kanban/offices/context"),
    myOffice: () => request<ActiveOfficeStateDto>("/kanban/me/office"),
    chooseMyOffice: (officeId: string) =>
      request<ActiveOfficeStateDto>("/kanban/me/office", { method: "PUT", body: JSON.stringify({ officeId }) }),
    userManagementContext: () =>
      request<FlowUserManagementContextDto>("/kanban/settings/users/context"),
    provisionUser: (body: ProvisionFlowUserPayload, idempotencyKey: string) =>
      request<FlowUserProvisioningResultDto>("/kanban/settings/users", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      }),
    list: () => request<{ data: OfficeListItemDto[] }>("/kanban/offices"),
    create: (body: { name: string; city?: string | null; uf?: string | null }) =>
      request<OfficeListItemDto>("/kanban/offices", { method: "POST", body: JSON.stringify(body) }),
    update: (officeId: string, body: Partial<{ name: string; active: boolean; city: string | null; uf: string | null; isPrincipal: true }>) =>
      request<OfficeListItemDto>(`/kanban/offices/${officeId}`, { method: "PATCH", body: JSON.stringify(body) }),
    users: () => request<{ data: OfficeUserDto[] }>("/kanban/office-users"),
    replaceUserOffices: (identityId: string, officeIds: string[], responsibleOfficeIds?: string[]) =>
      request<ReplaceUserOfficesResultDto>(`/kanban/office-users/${identityId}/offices`, {
        method: "PUT",
        body: JSON.stringify(responsibleOfficeIds ? { officeIds, responsibleOfficeIds } : { officeIds }),
      }),
    serviceContract: (officeId: string) =>
      request<ServiceContractDto>(`/kanban/offices/${officeId}/service-contract`),
    serviceContractVersion: (officeId: string, version: number) =>
      request<ServiceContractVersionDto>(`/kanban/offices/${officeId}/service-contract/versions/${version}`),
    uploadServiceContract: (officeId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<UploadServiceContractResultDto>(`/kanban/offices/${officeId}/service-contract/versions`, formData);
    },
    serviceContractDownload: (officeId: string, version: number) =>
      request<{ url: string; expiresAt: string }>(`/kanban/offices/${officeId}/service-contract/versions/${version}/download`),
    userLawyers: () => request<{ data: Array<{ identityId: string; ufs: string[] }> }>("/kanban/settings/users/lawyers"),
    userLawyer: (identityId: string) => request<UserLawyerDto>(`/kanban/settings/users/${identityId}/lawyer`),
    replaceUserLawyer: (identityId: string, body: { signatureName: string; oabs: UserOabDto[] }) =>
      request<UserLawyerDto>(`/kanban/settings/users/${identityId}/lawyer`, { method: "PUT", body: JSON.stringify(body) }),
    settings: () => request<OfficeSettingsDto>("/kanban/office-settings"),
    updateSettings: (officeVisibilityEnabled: boolean) =>
      request<OfficeSettingsDto>("/kanban/office-settings", {
        method: "PUT",
        body: JSON.stringify({ officeVisibilityEnabled }),
      }),
    assignBoardCards: (boardId: string, officeId: string, cardIds?: string[]) =>
      request<{ updated: number; cardIds: string[] }>(`/kanban/boards/${boardId}/office-assignment`, {
        method: "POST",
        body: JSON.stringify(cardIds ? { officeId, cardIds } : { officeId }),
      }),
    transferCard: (boardId: string, cardId: string, officeId: string, reason: string) =>
      request<TransferCardOfficeResultDto>(`/kanban/boards/${boardId}/cards/${cardId}/office`, {
        method: "POST",
        body: JSON.stringify({ officeId, reason }),
      }),
  },
  customers: {
    list: (params: { page?: number; pageSize?: number; search?: string } = {}) =>
      request<{ data: FlowCustomerSummaryDto[]; page: number; pageSize: number; total: number; validationConfigured: boolean }>(
        `/kanban/customers${toQueryString({
          page: String(params.page ?? 1),
          pageSize: String(params.pageSize ?? 20),
          search: params.search,
        })}`
      ),
    get: (customerId: string) => request<FlowCustomerDetailDto>(`/kanban/customers/${customerId}`),
    create: (body: FlowCustomerWritePayload) =>
      request<FlowCustomerDetailDto>("/kanban/customers", { method: "POST", body: JSON.stringify(body) }),
    update: (customerId: string, body: Partial<FlowCustomerWritePayload> & { status?: "active" | "inactive"; officeLinkReason?: string }) =>
      request<FlowCustomerDetailDto>(`/kanban/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(body) }),
    cards: (customerId: string) => request<FlowCustomerCardDto[]>(`/kanban/customers/${customerId}/cards`),
    createCard: (
      customerId: string,
      idempotencyKey: string,
      body: { boardId: string; columnId: string; officeId: string; title: string }
    ) =>
      request<{ cardId: string; replay: boolean }>(`/kanban/customers/${customerId}/cards`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      }),
    linkCard: (customerId: string, cardId: string, boardId: string) =>
      request<{ cardId: string; customerId: string }>(`/kanban/customers/${customerId}/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({ boardId }),
      }),
  },
  customerValidation: {
    status: (customerId: string) => request<CustomerValidationStatusDto>(`/kanban/customers/${customerId}/validation`),
    requestValidation: (customerId: string, officeId?: string) =>
      request<CustomerValidationStatusDto>(`/kanban/customers/${customerId}/validation`, {
        method: "POST",
        body: JSON.stringify(officeId ? { officeId } : {}),
      }),
    confirm: (customerId: string, runId: string) =>
      request<CustomerValidationStatusDto>(`/kanban/customers/${customerId}/validation/runs/${runId}/confirm`, {
        method: "POST",
      }),
    getSettings: () => request<CustomerValidationSettingsDto>("/kanban/settings/customer-validation"),
    saveSettings: (agentId: string) =>
      request<CustomerValidationSettingsDto>("/kanban/settings/customer-validation", {
        method: "PUT",
        body: JSON.stringify({ agentId }),
      }),
    saveOfficeSettings: (officeId: string, agentId: string | null) =>
      request<CustomerValidationSettingsDto>(`/kanban/settings/customer-validation/offices/${officeId}`, {
        method: "PUT",
        body: JSON.stringify({ agentId }),
      }),
    saveIntakeBoard: (officeId: string, boardId: string | null) =>
      request<CustomerValidationSettingsDto>(`/kanban/settings/customer-validation/offices/${officeId}/intake-board`, {
        method: "PUT",
        body: JSON.stringify({ boardId }),
      }),
    saveDocumentPolicy: (documentTypes: CustomerDocumentType[]) =>
      request<CustomerValidationSettingsDto>("/kanban/settings/customer-validation/documents", {
        method: "PUT",
        body: JSON.stringify({ documentTypes }),
      }),
    saveKitReview: (customerId: string, runId: string, review: KitReviewDto) =>
      request<CustomerValidationStatusDto>(`/kanban/customers/${customerId}/validation/runs/${runId}/kit-review`, {
        method: "PUT",
        body: JSON.stringify(review),
      }),
  },
  priorLawsuits: {
    get: (customerId: string) => request<PriorLawsuitsDto>(`/kanban/customers/${customerId}/prior-lawsuits`),
    add: (customerId: string, body: { bank: string; processNumber: string }) =>
      request<PriorLawsuitsDto>(`/kanban/customers/${customerId}/prior-lawsuits`, { method: "POST", body: JSON.stringify(body) }),
    remove: (customerId: string, lawsuitId: string) =>
      request<PriorLawsuitsDto>(`/kanban/customers/${customerId}/prior-lawsuits/${lawsuitId}`, { method: "DELETE" }),
    declareNone: (customerId: string) =>
      request<PriorLawsuitsDto>(`/kanban/customers/${customerId}/prior-lawsuits/declaration`, { method: "POST" }),
    withdrawDeclaration: (customerId: string) =>
      request<PriorLawsuitsDto>(`/kanban/customers/${customerId}/prior-lawsuits/declaration`, { method: "DELETE" }),
  },
  customerDocuments: {
    list: (customerId: string) => request<CustomerDocumentsDto>(`/kanban/customers/${customerId}/documents`),
    upload: (customerId: string, type: CustomerDocumentType, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<CustomerDocumentsDto>(`/kanban/customers/${customerId}/documents/${type}`, formData);
    },
    remove: (customerId: string, type: CustomerDocumentType) =>
      request<CustomerDocumentsDto>(`/kanban/customers/${customerId}/documents/${type}`, { method: "DELETE" }),
    updateProfile: (customerId: string, patch: Partial<CustomerDocumentProfileDto>) =>
      request<CustomerDocumentsDto>(`/kanban/customers/${customerId}/documents/profile`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    downloadUrl: (customerId: string, documentId: string) =>
      request<AttachmentDownloadUrlDto>(`/kanban/customers/${customerId}/documents/versions/${documentId}/download`),
  },
  drive: {
    getConfiguration: () => request<DriveConfigurationDto>("/kanban/settings/google-drive"),
    // Salva a pasta (opcional) e liga/desliga o envio; o backend valida a pasta no Google.
    saveConfiguration: (body: { rootFolderId?: string; enabled: boolean }) =>
      request<DriveConfigurationDto>("/kanban/settings/google-drive", { method: "PUT", body: JSON.stringify(body) }),
    startConnect: (redirectUri: string) =>
      request<{ authorizationUrl: string }>("/kanban/settings/google-drive/connect", {
        method: "POST",
        body: JSON.stringify({ redirectUri }),
      }),
    completeConnect: (body: { code: string; state: string; redirectUri: string }) =>
      request<DriveConfigurationDto>("/kanban/settings/google-drive/connect/complete", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    pickerToken: () => request<DrivePickerTokenDto>("/kanban/settings/google-drive/picker-token", { method: "POST" }),
    disconnect: () => request<DriveConfigurationDto>("/kanban/settings/google-drive", { method: "DELETE" }),
  },
  emailDispatches: {
    list: (status?: EmailDispatchFilter) =>
      request<EmailDispatchListDto>(`/kanban/automation-dispatches${status ? `?status=${status}` : ""}`),
    retry: (dispatchId: string) =>
      request<{ id: string; status: "pending" }>(`/kanban/automation-dispatches/${dispatchId}/retry`, { method: "POST" }),
  },
  claudeConnector: {
    getSettings: () => request<ClaudeConnectorSettingsDto>("/kanban/settings/claude-connector"),
    saveSettings: (body: ClaudeConnectorSettingsWritePayload) =>
      request<ClaudeConnectorSettingsDto>("/kanban/settings/claude-connector", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  // Checklist do card: envio (multipart, campos `file` + `documentTypeId`) e revisao.
  cardDocuments: {
    checklist: (boardId: string, cardId: string) =>
      request<CardChecklistDto>(`/kanban/boards/${boardId}/cards/${cardId}/documents`),
    upload: (boardId: string, cardId: string, documentTypeId: string, file: File) => {
      const formData = new FormData();
      formData.append("documentTypeId", documentTypeId);
      formData.append("file", file);
      return uploadRequest<CardDocumentDto>(`/kanban/boards/${boardId}/cards/${cardId}/documents`, formData);
    },
    review: (boardId: string, cardId: string, documentId: string, payload: ReviewCardDocumentPayload) =>
      request<CardDocumentDto>(`/kanban/boards/${boardId}/cards/${cardId}/documents/${documentId}/review`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  extraDocuments: {
    list: (boardId: string, cardId: string) =>
      request<CardExtraDocumentsDto>(`/kanban/boards/${boardId}/cards/${cardId}/extra-documents`),
    upload: (boardId: string, cardId: string, file: File, description: string) => {
      const formData = new FormData();
      if (description.trim()) formData.append("description", description.trim());
      formData.append("file", file);
      return uploadRequest<CardExtraDocumentDto>(`/kanban/boards/${boardId}/cards/${cardId}/extra-documents`, formData);
    },
    remove: (boardId: string, cardId: string, documentId: string) =>
      request<void>(`/kanban/boards/${boardId}/cards/${cardId}/extra-documents/${documentId}`, { method: "DELETE" }),
  },
  cardHiscon: {
    get: (boardId: string, cardId: string) =>
      request<CardHisconDto>(`/kanban/boards/${boardId}/cards/${cardId}/customer/hiscon`),
  },
  officeKit: {
    latest: (boardId: string, cardId: string) =>
      request<{ kit: CardOfficeKitDto | null }>(`/kanban/boards/${boardId}/cards/${cardId}/office-kit`),
    download: (boardId: string, cardId: string, kitId: string) =>
      request<{ url: string; expiresAt: string }>(`/kanban/boards/${boardId}/cards/${cardId}/office-kit/${kitId}/download`),
    signature: (boardId: string, cardId: string) =>
      request<CardSignatureDto>(`/kanban/boards/${boardId}/cards/${cardId}/office-kit/signature`),
    uploadSigned: (boardId: string, cardId: string, kitId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<CardSignatureDto>(`/kanban/boards/${boardId}/cards/${cardId}/office-kit/${kitId}/signed`, formData);
    },
    downloadSigned: (boardId: string, cardId: string, kitId: string, signedKitId: string) =>
      request<{ url: string; expiresAt: string }>(`/kanban/boards/${boardId}/cards/${cardId}/office-kit/${kitId}/signed/${signedKitId}/download`),
    confirmSignatureValidation: (boardId: string, cardId: string, kitId: string, runId: string) =>
      request<CardSignatureDto>(`/kanban/boards/${boardId}/cards/${cardId}/office-kit/${kitId}/signature-validation/${runId}/confirm`, { method: "POST" }),
  },
  // Envio do lead e fila do gestor (Sprint 4). Fila, devolucao e campos obrigatorios exigem `flow:admin`.
  actionAnalysis: {
    latest: (boardId: string, cardId: string) =>
      request<{ analysis: ActionAnalysisDto | null }>(`/kanban/boards/${boardId}/cards/${cardId}/action-analysis`),
  },
  initialPetitions: {
    latest: (boardId: string, cardId: string) =>
      request<InitialPetitionsLatestDto>(`/kanban/boards/${boardId}/cards/${cardId}/initial-petitions`),
    registerProtocol: (boardId: string, cardId: string, petitionId: string, processNumber: string) =>
      request<InitialPetitionsLatestDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/initial-petitions/${petitionId}/protocol`,
        { method: "POST", body: JSON.stringify({ processNumber }) },
      ),
    download: (boardId: string, cardId: string, documentId: string) =>
      request<{ url: string; expiresAt: string }>(`/kanban/boards/${boardId}/cards/${cardId}/initial-petitions/documents/${documentId}/download`),
    approve: (boardId: string, cardId: string, documentId: string) =>
      request<{ run: InitialPetitionsRunDto | null }>(
        `/kanban/boards/${boardId}/cards/${cardId}/initial-petitions/documents/${documentId}/approve`,
        { method: "POST" },
      ),
    uploadCorrected: (boardId: string, cardId: string, documentId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<CorrectedPetitionResultDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/initial-petitions/documents/${documentId}/corrected-version`,
        formData,
      );
    },
  },
  leads: {
    get: (boardId: string, cardId: string) => request<CardLeadDto>(`/kanban/boards/${boardId}/cards/${cardId}/lead`),
    submit: (boardId: string, cardId: string) =>
      request<CardLeadDto>(`/kanban/boards/${boardId}/cards/${cardId}/lead/submit`, { method: "POST" }),
    returnToOffice: (boardId: string, cardId: string, reason: string) =>
      request<CardLeadDto>(`/kanban/boards/${boardId}/cards/${cardId}/lead/return`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    queue: (filters: LeadQueueFilters) =>
      request<{ data: LeadQueueItemDto[]; meta: PageMeta }>(
        `/kanban/leads${toQueryString({
          officeId: filters.officeId,
          boardId: filters.boardId,
          status: filters.status,
          submittedFrom: filters.submittedFrom,
          submittedTo: filters.submittedTo,
          limit: String(filters.limit),
          offset: String(filters.offset),
        })}`
      ),
    // Sprint 6 (P11): documentos ENTREGUES (aprovados do ciclo atual), para quem ve o card.
    documents: (boardId: string, cardId: string) =>
      request<LeadDeliveredDocumentsDto>(`/kanban/boards/${boardId}/cards/${cardId}/lead/documents`),
    downloadDocument: (boardId: string, cardId: string, documentId: string, format: DocumentFormat) =>
      request<GeneratedDocumentDownloadDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/lead/documents/${documentId}/download${toQueryString({ format })}`
      ),
    settings: () => request<LeadSettingsDto>("/kanban/lead-settings"),
    updateSettings: (requiredFields: string[]) =>
      request<LeadSettingsDto>("/kanban/lead-settings", { method: "PUT", body: JSON.stringify({ requiredFields }) }),
  },
  // Analise do lead pelo gestor (Sprint 6): classificacao, geracao, revisao e PDF. Somente `flow:admin`.
  leadAnalysis: {
    get: (boardId: string, cardId: string) => request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis`),
    addCase: (boardId: string, cardId: string, caseTypeId: string) =>
      request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis/cases`, {
        method: "POST",
        body: JSON.stringify({ caseTypeId }),
      }),
    changeCase: (boardId: string, cardId: string, caseId: string, caseTypeId: string, reason: string) =>
      request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis/cases/${caseId}`, {
        method: "PATCH",
        body: JSON.stringify({ caseTypeId, reason }),
      }),
    removeCase: (boardId: string, cardId: string, caseId: string, reason: string) =>
      request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis/cases/${caseId}/remove`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    generate: (boardId: string, cardId: string, caseId: string, templateId?: string) =>
      request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis/cases/${caseId}/documents`, {
        method: "POST",
        body: JSON.stringify(templateId ? { templateId } : {}),
      }),
    approve: (boardId: string, cardId: string, documentId: string) =>
      request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis/documents/${documentId}/approve`, {
        method: "POST",
      }),
    // Multipart com o campo `file` (.docx ate 10 MB); a versao enviada nasce aprovada.
    uploadEditedVersion: (boardId: string, cardId: string, documentId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<EditedVersionResultDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/analysis/documents/${documentId}/edited-version`,
        formData
      );
    },
    retryPdf: (boardId: string, cardId: string, documentId: string) =>
      request<LeadAnalysisDto>(`/kanban/boards/${boardId}/cards/${cardId}/analysis/documents/${documentId}/pdf/retry`, {
        method: "POST",
      }),
    download: (boardId: string, cardId: string, documentId: string, format: DocumentFormat) =>
      request<GeneratedDocumentDownloadDto>(
        `/kanban/boards/${boardId}/cards/${cardId}/analysis/documents/${documentId}/download${toQueryString({ format })}`
      ),
  },
  // Tipos de caso e modelos de documento (Sprint 5): configuracao do tenant, somente `flow:admin`.
  caseTypes: {
    list: () => request<{ data: CaseTypeDto[] }>("/kanban/case-types"),
    get: (caseTypeId: string) => request<CaseTypeDto>(`/kanban/case-types/${caseTypeId}`),
    create: (body: CaseTypePayload) =>
      request<CaseTypeDto>("/kanban/case-types", { method: "POST", body: JSON.stringify(body) }),
    update: (caseTypeId: string, body: Partial<CaseTypePayload & { active: boolean }>) =>
      request<CaseTypeDto>(`/kanban/case-types/${caseTypeId}`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  documentTemplates: {
    catalog: () => request<TemplateCatalogDto>("/kanban/template-variables"),
    list: () => request<{ data: DocumentTemplateDto[] }>("/kanban/document-templates"),
    get: (templateId: string) => request<DocumentTemplateDetailDto>(`/kanban/document-templates/${templateId}`),
    create: (body: { name: string; description: string | null }) =>
      request<DocumentTemplateDetailDto>("/kanban/document-templates", { method: "POST", body: JSON.stringify(body) }),
    update: (templateId: string, body: Partial<{ name: string; description: string | null; active: boolean }>) =>
      request<DocumentTemplateDetailDto>(`/kanban/document-templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    // Multipart com o campo `file` (.docx ate 10 MB); validacao completa no backend.
    uploadVersion: (templateId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadRequest<TemplateVersionDetailDto>(`/kanban/document-templates/${templateId}/versions`, formData);
    },
    getVersion: (templateId: string, versionId: string) =>
      request<TemplateVersionDetailDto>(`/kanban/document-templates/${templateId}/versions/${versionId}`),
    updateVariables: (templateId: string, versionId: string, variables: Array<{ key: string; required: boolean }>) =>
      request<TemplateVersionDetailDto>(`/kanban/document-templates/${templateId}/versions/${versionId}/variables`, {
        method: "PATCH",
        body: JSON.stringify({ variables }),
      }),
    download: (templateId: string, versionId: string) =>
      request<{ url: string; expiresAt: string }>(
        `/kanban/document-templates/${templateId}/versions/${versionId}/download`
      ),
  },
};

/** Processos atualizados hoje pelo monitoramento (DataJud e DJEN) que o usuario ve. */
export function fetchMonitoringUpdatesToday(): Promise<MonitoringUpdatesTodayDto> {
  return request<MonitoringUpdatesTodayDto>("/domain-integrations/flow/monitoramento/hoje");
}
