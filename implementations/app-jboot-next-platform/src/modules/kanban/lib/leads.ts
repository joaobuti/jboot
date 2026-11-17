import { CardLeadDto, KanbanApiError, LeadPendingDocumentDto, LeadStatus } from "@/modules/kanban/lib/kanban-api";

/**
 * Apoio de UI do envio do lead (CRM de leads, Sprint 4). A regra e do backend:
 * aqui so ha rotulos, mensagens pt-BR e o espelho de validacao do motivo.
 */

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; badge: string; icon: string }> = {
  rascunho: { label: "Rascunho", badge: "bg-secondary-subtle text-secondary", icon: "ri-draft-line" },
  enviado: { label: "Enviado para análise", badge: "bg-primary-subtle text-primary", icon: "ri-send-plane-line" },
  em_processamento: { label: "Em processamento", badge: "bg-info-subtle text-info", icon: "ri-loader-4-line" },
  aguardando_revisao: { label: "Aguardando revisão", badge: "bg-info-subtle text-info", icon: "ri-eye-line" },
  aprovado: { label: "Aprovado", badge: "bg-success-subtle text-success", icon: "ri-checkbox-circle-line" },
  devolvido: { label: "Devolvido ao escritório", badge: "bg-warning-subtle text-warning", icon: "ri-arrow-go-back-line" },
  falha_processamento: { label: "Falha no processamento", badge: "bg-danger-subtle text-danger", icon: "ri-error-warning-line" },
};

/** Estados que a fila oferece no filtro, na ordem do fluxo. */
export const LEAD_QUEUE_STATUSES: LeadStatus[] = [
  "enviado",
  "devolvido",
  "aguardando_revisao",
  "em_processamento",
  "falha_processamento",
  "aprovado",
];

/** Rotulos do catalogo de campos do backend (`leads/lead-fields.ts`). Chave desconhecida aparece como veio. */
export const LEAD_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  addressZip: "CEP",
  addressStreet: "Logradouro",
  addressNumber: "Número",
  addressComplement: "Complemento",
  addressNeighborhood: "Bairro",
  addressCity: "Cidade",
  addressState: "UF",
  "juridico.dataNascimento": "Data de nascimento",
  "juridico.nacionalidade": "Nacionalidade",
  "juridico.estadoCivil": "Estado civil",
  "juridico.profissao": "Profissão",
  "juridico.rgNumero": "RG",
  "juridico.rgOrgaoEmissor": "Órgão emissor do RG",
  "juridico.rgUf": "UF do RG",
  "juridico.nomeMae": "Nome da mãe",
  "juridico.numeroBeneficio": "Número do benefício",
  "juridico.especieBeneficio": "Espécie do benefício",
  "juridico.bancoPagamento": "Banco de pagamento",
};

export const LEAD_FIELD_GROUPS: Array<{ label: string; icon: string; keys: string[] }> = [
  { label: "Dados gerais", icon: "ri-user-line", keys: ["name", "email", "phone"] },
  {
    label: "Endereço",
    icon: "ri-map-pin-line",
    keys: ["addressZip", "addressStreet", "addressNumber", "addressComplement", "addressNeighborhood", "addressCity", "addressState"],
  },
  {
    label: "Dados jurídicos",
    icon: "ri-scales-3-line",
    keys: [
      "juridico.dataNascimento",
      "juridico.nacionalidade",
      "juridico.estadoCivil",
      "juridico.profissao",
      "juridico.rgNumero",
      "juridico.rgOrgaoEmissor",
      "juridico.rgUf",
      "juridico.nomeMae",
      "juridico.numeroBeneficio",
      "juridico.especieBeneficio",
      "juridico.bancoPagamento",
    ],
  },
];

export function leadFieldLabel(key: string): string {
  return LEAD_FIELD_LABELS[key] ?? key;
}

/** Espelho do backend (`ReturnLeadDto`): motivo de 10 a 500 caracteres apos aparar. */
export const LEAD_RETURN_REASON_MIN = 10;
export const LEAD_RETURN_REASON_MAX = 500;

export function validateLeadReturnReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < LEAD_RETURN_REASON_MIN) {
    return `Informe o motivo da devolução (mínimo de ${LEAD_RETURN_REASON_MIN} caracteres).`;
  }
  if (trimmed.length > LEAD_RETURN_REASON_MAX) {
    return `O motivo pode ter no máximo ${LEAD_RETURN_REASON_MAX} caracteres.`;
  }
  return null;
}

/**
 * Painel de envio no card: aparece em quadro com captacao ligada ou quando o
 * lead ja teve envio (quadro de tarefas comum nao ganha painel novo).
 */
export function shouldShowLeadPanel(lead: CardLeadDto | null): boolean {
  if (!lead) {
    return false;
  }
  return lead.leadIntakeEnabled || lead.status !== "rascunho" || lead.history.length > 0;
}

export interface LeadMissingSummary {
  customerLinked: boolean;
  missingFields: string[];
  pendingDocumentTypes: LeadPendingDocumentDto[];
}

/** Lista do que falta vinda do 422 `lead_incomplete` (ou `null` para outro erro). */
export function leadIncompleteFromError(error: unknown): LeadMissingSummary | null {
  if (!(error instanceof KanbanApiError) || error.code !== "lead_incomplete" || !error.payload) {
    return null;
  }
  const payload = error.payload;
  const pending = Array.isArray(payload.pendingDocumentTypes) ? payload.pendingDocumentTypes : [];
  return {
    customerLinked: payload.customerLinked === true,
    missingFields: Array.isArray(payload.missingFields)
      ? payload.missingFields.filter((key): key is string => typeof key === "string")
      : [],
    pendingDocumentTypes: pending
      .filter((item): item is LeadPendingDocumentDto => Boolean(item) && typeof item === "object" && typeof (item as { name?: unknown }).name === "string")
      .map((item) => ({ id: item.id, name: item.name, state: item.state === "rejeitado" ? "rejeitado" : "pendente" })),
  };
}

/** Itens do que falta em texto (painel e mensagem de erro). */
export function describeLeadMissing(summary: LeadMissingSummary): string[] {
  const items: string[] = [];
  if (!summary.customerLinked) {
    items.push("Vincular o cliente ao card");
  }
  for (const key of summary.missingFields) {
    items.push(`Preencher ${leadFieldLabel(key)}`);
  }
  for (const document of summary.pendingDocumentTypes) {
    items.push(`${document.state === "rejeitado" ? "Reenviar" : "Enviar"} ${document.name}`);
  }
  return items;
}

/** Mensagens pt-BR dos erros estruturados do envio/fila; `null` se nao for do lead. */
export function describeLeadError(error: KanbanApiError): string | null {
  switch (error.code) {
    case "lead_incomplete": {
      const summary = leadIncompleteFromError(error);
      const items = summary ? describeLeadMissing(summary) : [];
      return `O lead ainda não pode ser enviado.${items.length > 0 ? ` Falta: ${items.join("; ")}.` : ""}`;
    }
    case "lead_frozen":
      return "Lead enviado para análise: a edição fica bloqueada até o gestor devolver ao escritório.";
    case "lead_intake_disabled":
      return "A captação de leads não está ligada neste quadro. Procure o administrador.";
    case "lead_not_submittable":
      return "Este lead já foi enviado e aguarda o gestor.";
    case "lead_not_returnable":
      return "Só um lead enviado pode ser devolvido ao escritório.";
    case "lead_admin_required":
      return "Somente o administrador do Flow acessa a fila de leads e devolve leads.";
    case "invalid_lead_fields":
      return "Há campos que não existem no cadastro. Recarregue a página e tente de novo.";
    default:
      return null;
  }
}

export function formatLeadDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
