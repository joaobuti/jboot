import { describeOfficeError } from "@/modules/kanban/lib/offices";
import { describeLeadError } from "@/modules/kanban/lib/leads";
import { describeTemplateError } from "@/modules/kanban/lib/document-templates";
import { describeAnalysisError } from "@/modules/kanban/lib/lead-analysis";
import {
  CHECKLIST_INCOMPLETE_CODE,
  COLUMN_REQUIREMENTS_UNMET_CODE,
  ENTRY_REQUIREMENT_LABEL,
  EntryRequirement,
  CONTENT_SIGNATURE_MISMATCH_CODE,
  ChecklistItemState,
  CardChecklistSummaryDto,
  KanbanApiError,
} from "@/modules/kanban/lib/kanban-api";

/**
 * Espelho dos limites do backend (`MAX_ATTACHMENT_SIZE_BYTES` e
 * `ALLOWED_ATTACHMENT_CONTENT_TYPES` em
 * bff-jboot-platform/src/modules/kanban/attachments/attachments.service.ts).
 * O backend continua sendo a validacao autoritativa; aqui so evita enviar 25MB
 * pelo celular para receber 413/415 no fim. Alterar os dois lados juntos.
 */
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;

/** `accept` do seletor de arquivo (galeria/arquivos). */
export const DOCUMENT_FILE_ACCEPT = ALLOWED_DOCUMENT_CONTENT_TYPES.join(",");
/** `accept` do botao de camera (com `capture`): so formatos de foto aceitos pelo backend. */
export const DOCUMENT_CAMERA_ACCEPT = "image/jpeg,image/png,image/webp";

/** Retorna mensagem de erro para o operador ou `null` quando o arquivo pode ser enviado. */
export function validateDocumentFile(file: { size: number; type: string }): string | null {
  if (file.size <= 0) {
    return "Arquivo vazio.";
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return "Arquivo acima de 25 MB.";
  }
  if (!(ALLOWED_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Tipo de arquivo nao aceito. Use imagem (JPG, PNG, WEBP, GIF), PDF, Office, TXT, CSV ou ZIP.";
  }
  return null;
}

export const CHECKLIST_STATE_LABELS: Record<ChecklistItemState, { label: string; badge: string; icon: string }> = {
  pendente: { label: "Pendente", badge: "bg-secondary-subtle text-secondary", icon: "ri-time-line" },
  enviado: { label: "Enviado", badge: "bg-info-subtle text-info", icon: "ri-upload-cloud-2-line" },
  aceito: { label: "Aceito", badge: "bg-success-subtle text-success", icon: "ri-checkbox-circle-line" },
  rejeitado: { label: "Rejeitado", badge: "bg-danger-subtle text-danger", icon: "ri-close-circle-line" },
};

/**
 * Sinalizacao "Checklist pendente" (CRM de leads, Sprint 3): card em coluna que exige
 * checklist completo com obrigatorio pendente. Mesmo padrao visual do indicador de
 * completude (badge soft + icone); a regra e do backend (`checklistPending`).
 */
export const CHECKLIST_PENDING_BADGE = {
  label: "Checklist pendente",
  badge: "bg-danger-subtle text-danger",
  icon: "ri-error-warning-line",
  title: "Card em coluna que exige checklist completo, com documento obrigatorio pendente",
} as const;

/** Indicador do tile/modal; `null` quando o quadro nao tem tipo obrigatorio ativo. */
export function checklistIndicator(summary: CardChecklistSummaryDto | undefined): {
  label: string;
  complete: boolean;
} | null {
  if (!summary || summary.totalRequired <= 0) {
    return null;
  }
  return {
    label: `${summary.acceptedRequired}/${summary.totalRequired}`,
    complete: summary.acceptedRequired >= summary.totalRequired,
  };
}

export function pendingDocumentNames(error: unknown): string[] {
  if (!(error instanceof KanbanApiError) || error.code !== CHECKLIST_INCOMPLETE_CODE) {
    return [];
  }
  const pending = error.payload?.pendingDocumentTypes;
  if (!Array.isArray(pending)) {
    return [];
  }
  return pending
    .map((item) => (item && typeof item === "object" ? (item as { name?: unknown }).name : null))
    .filter((name): name is string => typeof name === "string");
}

/**
 * Mensagem para erro de API do Flow. `checklist_incomplete` vira texto com a
 * lista dos documentos obrigatorios pendentes; demais erros usam a mensagem
 * estruturada do backend quando existir.
 */
export function describeKanbanError(error: unknown, fallback: string): string {
  if (error instanceof KanbanApiError) {
    if (error.code === COLUMN_REQUIREMENTS_UNMET_CODE) {
      const unmet = error.payload?.unmetRequirements;
      const names = Array.isArray(unmet)
        ? unmet.map((item) => ENTRY_REQUIREMENT_LABEL[item as EntryRequirement] ?? String(item))
        : [];
      const hint = names.includes(ENTRY_REQUIREMENT_LABEL.customer_hiscon)
        ? " Envie o HISCON no painel Cliente do card (ou na ficha do cliente)."
        : "";
      return `Esta coluna exige para entrar: ${names.join(", ") || "requisitos nao cumpridos"}.${hint}`;
    }
    if (error.code === CHECKLIST_INCOMPLETE_CODE) {
      const names = pendingDocumentNames(error);
      const suffix = names.length > 0 ? ` Pendentes: ${names.join(", ")}.` : "";
      return `Checklist incompleto: o card so entra nesta coluna com todos os documentos obrigatorios aceitos.${suffix}`;
    }
    // Escritorios (Sprint 3.5): criar card, atribuir responsavel, administrar escritorios.
    const officeMessage = describeOfficeError(error.code);
    if (officeMessage) {
      return officeMessage;
    }
    // Envio do lead e fila do gestor (Sprint 4).
    const leadMessage = describeLeadError(error);
    if (leadMessage) {
      return leadMessage;
    }
    // Analise do lead e documento gerado (Sprint 6); antes dos codigos de modelo (S5), que ela reaproveita.
    const analysisMessage = describeAnalysisError(error);
    if (analysisMessage) {
      return analysisMessage;
    }
    // Tipos de caso e modelos de documento (Sprint 5).
    const templateMessage = describeTemplateError(error);
    if (templateMessage) {
      return templateMessage;
    }
    // Documentos da ficha: o agente nao abre PDF com senha nem corrompido.
    if (error.code === "customer_document_password_protected") {
      return "PDF com senha não é aceito. Remova a senha (ou salve uma cópia sem proteção) e envie novamente.";
    }
    if (error.code === "customer_document_unreadable") {
      return "Não foi possível abrir este PDF. Envie outro arquivo.";
    }
    if (error.code === CONTENT_SIGNATURE_MISMATCH_CODE) {
      return "O conteudo do arquivo nao corresponde ao tipo informado. Envie o arquivo original (imagem, PDF, Office, TXT, CSV ou ZIP).";
    }
    return error.detail ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}
