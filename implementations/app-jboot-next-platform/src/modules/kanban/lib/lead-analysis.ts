import {
  AnalysisCaseTypeOptionDto,
  AnalysisTemplateOptionDto,
  DocumentPdfStateDto,
  GeneratedDocumentDto,
  GeneratedDocumentStatus,
  KanbanApiError,
  LeadCaseDto,
  LeadStatus,
  TemplateWarningDto,
} from "@/modules/kanban/lib/kanban-api";

/**
 * Apoio de UI da analise do lead pelo gestor e da entrega ao escritorio (CRM de
 * leads, Sprint 6). As regras sao do backend (estado, permissao, variaveis,
 * PDF); aqui so rotulos, selecao padrao do modelo, espelho de validacao do
 * motivo e mensagens pt-BR dos codigos estruturados.
 */

export interface BadgeMeta {
  label: string;
  className: string;
}

export const DOCUMENT_STATUS_META: Record<GeneratedDocumentStatus, BadgeMeta> = {
  rascunho: { label: "Rascunho", className: "bg-warning-subtle text-warning" },
  aprovado: { label: "Aprovado", className: "bg-success-subtle text-success" },
  substituido: { label: "Substituído", className: "bg-secondary-subtle text-secondary" },
};

/** Estado do PDF do aprovado. `failed` aparece como "PDF pendente" (criterio da S6). */
export function pdfBadge(pdf: DocumentPdfStateDto | null): BadgeMeta | null {
  if (!pdf) {
    return null;
  }
  if (pdf.status === "done") {
    return { label: "PDF gerado", className: "bg-success-subtle text-success" };
  }
  if (pdf.status === "failed") {
    return { label: "PDF pendente", className: "bg-danger-subtle text-danger" };
  }
  return { label: "Gerando PDF", className: "bg-info-subtle text-info" };
}

export const PDF_ERROR_MESSAGES: Record<string, string> = {
  converter_not_configured: "conversor de PDF não configurado",
  converter_unavailable: "conversor de PDF indisponível",
  converter_timeout: "a conversão passou do tempo limite",
  converter_auth_failed: "credencial do conversor recusada",
  converter_rejected: "o conversor recusou o arquivo",
  converter_invalid_output: "o conversor devolveu um arquivo inválido",
  source_missing: "o .docx aprovado não foi encontrado no armazenamento",
  source_integrity_mismatch: "o .docx armazenado não confere com o aprovado",
  storage_unavailable: "armazenamento indisponível",
  stored_pdf_invalid: "PDF armazenado inválido",
  internal_error: "erro interno",
};

export function describePdfError(code: string | null): string {
  return code ? (PDF_ERROR_MESSAGES[code] ?? code) : "motivo desconhecido";
}

/** Analise do gestor: estados em que classifica, gera e aprova. */
export const ANALYSIS_OPEN_STATUSES: LeadStatus[] = ["enviado", "aguardando_revisao", "aprovado"];

/** Painel de analise no card: so com envio (rascunho nunca enviado nao tem analise). */
export function shouldShowAnalysisPanel(status: LeadStatus | null | undefined, hasSubmission: boolean): boolean {
  return Boolean(status) && hasSubmission && status !== "rascunho";
}

/** Documento vigente do caso: o mais novo que nao foi substituido (aprovado ou rascunho). */
export function currentDocument(leadCase: LeadCaseDto): GeneratedDocumentDto | null {
  return leadCase.documents.find((document) => document.status !== "substituido") ?? null;
}

/** Documento aprovado vigente do caso (o que o escritorio recebe). */
export function approvedDocument(leadCase: LeadCaseDto): GeneratedDocumentDto | null {
  return leadCase.documents.find((document) => document.status === "aprovado") ?? null;
}

/** Modelos do tipo de caso; o padrao vem primeiro. */
export function templatesForCase(caseTypes: AnalysisCaseTypeOptionDto[], caseTypeId: string): AnalysisTemplateOptionDto[] {
  const templates = caseTypes.find((type) => type.id === caseTypeId)?.templates ?? [];
  return [...templates].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** Modelo pre-selecionado: o padrao utilizavel; senao o primeiro utilizavel; senao nenhum. */
export function defaultTemplateId(templates: AnalysisTemplateOptionDto[]): string | null {
  return templates.find((template) => template.isDefault && template.usable)?.id ?? templates.find((template) => template.usable)?.id ?? null;
}

export const TEMPLATE_UNUSABLE_LABELS: Record<string, string> = {
  template_inactive: "modelo inativo",
  template_without_version: "modelo sem arquivo",
  template_version_not_usable: "versão atual com variável desconhecida",
};

/** Tipos de caso que ainda podem ser acrescentados (sem duplicar caso ativo). */
export function availableCaseTypes(caseTypes: AnalysisCaseTypeOptionDto[], cases: LeadCaseDto[], keepCaseTypeId?: string) {
  const used = new Set(cases.map((item) => item.caseTypeId).filter((id) => id !== keepCaseTypeId));
  return caseTypes.filter((type) => !used.has(type.id));
}

/** Espelho do backend (`ChangeLeadCaseDto`/`RemoveLeadCaseDto`): motivo de 10 a 500 caracteres apos aparar. */
export const ANALYSIS_REASON_MIN = 10;
export const ANALYSIS_REASON_MAX = 500;

export function validateAnalysisReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < ANALYSIS_REASON_MIN) {
    return `Informe o motivo (mínimo de ${ANALYSIS_REASON_MIN} caracteres).`;
  }
  if (trimmed.length > ANALYSIS_REASON_MAX) {
    return `O motivo pode ter no máximo ${ANALYSIS_REASON_MAX} caracteres.`;
  }
  return null;
}

/** Campos faltantes do 422 `document_required_variables_missing` (rotulos do catalogo). */
export function missingVariablesFromError(error: unknown): string[] | null {
  if (!(error instanceof KanbanApiError) || error.code !== "document_required_variables_missing" || !error.payload) {
    return null;
  }
  const list = Array.isArray(error.payload.missingVariables) ? error.payload.missingVariables : [];
  return list
    .filter((item): item is { key: string; label?: unknown } => Boolean(item) && typeof (item as { key?: unknown }).key === "string")
    .map((item) => (typeof item.label === "string" ? item.label : item.key));
}

export function describeEditedWarning(warning: TemplateWarningDto): string {
  if (warning.code === "template_tag_left") {
    return `O documento ainda tem marcador de variável (${warning.detail ?? "{{...}}"}).`;
  }
  if (warning.code === "fill_marker_left") {
    return "O documento ainda tem marcador [PREENCHER: ...].";
  }
  if (warning.code === "attached_template_external") {
    return "O documento aponta para um modelo anexo externo do Word (ignorado).";
  }
  return warning.detail ?? warning.code;
}

/** Mensagens pt-BR dos erros estruturados da analise e da entrega; `null` se nao for da S6. */
export function describeAnalysisError(error: KanbanApiError): string | null {
  switch (error.code) {
    case "document_required_variables_missing": {
      const labels = missingVariablesFromError(error) ?? [];
      return `Documento não gerado: campos obrigatórios do modelo sem valor no cadastro enviado${
        labels.length > 0 ? `: ${labels.join(", ")}` : ""
      }. Devolva o lead ao escritório para completar o cadastro ou marque o campo como opcional no modelo.`;
    }
    case "lead_not_in_analysis":
      return "O lead não está aguardando a análise do gestor (foi devolvido ou ainda não foi enviado).";
    case "lead_cycle_changed":
      return "O lead foi devolvido ou reenviado enquanto você trabalhava. Feche e abra o card de novo.";
    case "case_type_already_classified":
      return "Este lead já tem um caso ativo desse tipo.";
    case "case_type_unchanged":
      return "Escolha um tipo de caso diferente do atual.";
    case "case_type_inactive":
      return "Tipo de caso inativo: não pode ser usado na classificação.";
    case "lead_case_limit_reached":
      return "O lead chegou ao limite de casos.";
    case "lead_case_not_found":
      return "Caso não encontrado (pode ter sido trocado ou removido). Recarregue o card.";
    case "generated_document_not_found":
      return "Documento não encontrado.";
    case "document_not_reviewable":
      return "Esta versão do documento já foi revisada ou substituída.";
    case "document_not_approved":
      return "Só o documento aprovado tem PDF.";
    case "pdf_already_generated":
      return "O PDF deste documento já foi gerado.";
    case "pdf_not_ready":
      return "O PDF ainda não está disponível. Baixe o .docx ou tente de novo em instantes.";
    case "template_integrity_mismatch":
      return "O arquivo do modelo no armazenamento não confere com a versão cadastrada. Envie o modelo de novo.";
    case "document_content_type_not_allowed":
      return "Envie a versão editada em Word (.docx).";
    case "document_too_large":
      return "A versão editada passa do limite de 10 MB.";
    case "document_render_failed":
      return "O documento não pôde ser gerado a partir do modelo. Revise o modelo no Word e envie nova versão.";
    case "template_validation_timeout":
      return "O processamento do documento passou do tempo limite. Tente de novo.";
    default:
      return null;
  }
}

export function formatBytesShort(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
