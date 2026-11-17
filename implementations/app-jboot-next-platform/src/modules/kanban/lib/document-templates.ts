import {
  CaseTypeDto,
  CaseTypePayload,
  KanbanApiError,
  TemplateVariableDto,
  TemplateVersionStatus,
  TemplateWarningDto,
} from "@/modules/kanban/lib/kanban-api";

/**
 * Regras de tela dos tipos de caso e modelos de documento (CRM de leads,
 * Sprint 5). A validacao real do modelo e do backend (pacote, macro, vinculo
 * externo, catalogo, render de prova); aqui so a pre-validacao de arquivo
 * (espelho de `TEMPLATE_LIMITS.maxCompressedBytes` e da extensao) e as
 * mensagens pt-BR dos codigos estruturados.
 */

export const TEMPLATE_MAX_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_ACCEPT = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function validateTemplateFile(file: { name: string; size: number }): string | null {
  if (!/\.docx$/i.test(file.name)) {
    return "Envie o modelo em Word (.docx). Arquivos .doc, .docm, .dotx e PDF não são aceitos.";
  }
  if (file.size <= 0) {
    return "O arquivo está vazio.";
  }
  if (file.size > TEMPLATE_MAX_BYTES) {
    return "O modelo passa do limite de 10 MB.";
  }
  return null;
}

export interface BadgeInfo {
  label: string;
  className: string;
}

export function versionStatusBadge(status: TemplateVersionStatus | null): BadgeInfo {
  if (status === "valid") {
    return { label: "Pronto para uso", className: "bg-success-subtle text-success" };
  }
  if (status === "invalid_variables") {
    return { label: "Variáveis desconhecidas", className: "bg-warning-subtle text-warning" };
  }
  return { label: "Sem arquivo", className: "bg-secondary-subtle text-secondary" };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function describeTemplateWarning(warning: TemplateWarningDto): string {
  if (warning.code === "possible_malformed_tag") {
    return `Possível variável digitada errado: "${warning.detail ?? ""}". Use chaves duplas, como {{cliente.nome}}.`;
  }
  if (warning.code === "attached_template_external") {
    return "O arquivo aponta para um modelo anexo externo do Word; ele é ignorado na geração.";
  }
  return warning.detail ?? warning.code;
}

const LIMIT_LABELS: Record<string, string> = {
  entries: "arquivos internos demais (máximo 2.000)",
  uncompressed_size: "conteúdo descompactado acima de 50 MB",
  compression_ratio: "taxa de compressão suspeita (acima de 100:1)",
};

const SYNTAX_ERRORS: Record<string, string> = {
  unclosed_tag: "variável sem fechamento",
  unopened_tag: "fechamento sem abertura",
  unclosed_loop: "bloco aberto sem fechamento",
  unopened_loop: "fechamento de bloco sem abertura",
  closing_tag_does_not_match_opening_tag: "fechamento diferente da abertura",
  duplicate_open_tag: "abertura duplicada",
  duplicate_close_tag: "fechamento duplicado",
};

function payloadArray(error: KanbanApiError, key: string): unknown[] {
  const value = error.payload?.[key];
  return Array.isArray(value) ? value : [];
}

/** Mensagem principal + itens (tags, erros) dos codigos de modelo; `null` = nao e erro de modelo. */
export function templateErrorDetails(error: KanbanApiError): { message: string; items: string[] } | null {
  switch (error.code) {
    case "template_admin_required":
      return { message: "Somente o administrador do Flow cadastra tipos de caso e modelos.", items: [] };
    case "template_content_type_not_allowed":
      return { message: "Envie o modelo em Word (.docx). Arquivos .doc, .docm, .dotx e PDF não são aceitos.", items: [] };
    case "template_too_large":
      return { message: "O modelo passa do limite de 10 MB.", items: [] };
    case "template_archive_invalid":
      return { message: "O arquivo não é um .docx válido (pacote corrompido ou protegido). Salve de novo no Word e envie.", items: [] };
    case "template_archive_limits_exceeded": {
      const limit = typeof error.payload?.limit === "string" ? error.payload.limit : "";
      return {
        message: `O arquivo foi recusado por segurança: ${LIMIT_LABELS[limit] ?? "limites do pacote excedidos"}.`,
        items: [],
      };
    }
    case "template_not_word_document":
      return { message: "O arquivo não é um documento do Word (.docx).", items: [] };
    case "template_macro_forbidden":
      return { message: "Modelos com macro (.docm/.dotm) não são aceitos. Salve como 'Documento do Word (.docx)'.", items: [] };
    case "template_embedded_object_forbidden":
      return { message: "O modelo tem objeto incorporado (OLE, ActiveX, planilha ou gráfico). Remova e envie de novo.", items: [] };
    case "template_external_link_forbidden":
      return {
        message: "O modelo tem conteúdo vinculado externamente (imagem por link, campo DDE/INCLUDE). Incorpore a imagem ou remova o vínculo.",
        items: [],
      };
    case "template_invalid": {
      const items = payloadArray(error, "errors").map((item) => {
        const entry = item as { id?: string; tag?: string };
        const reason = SYNTAX_ERRORS[entry.id ?? ""] ?? "erro de sintaxe";
        return entry.tag ? `${reason}: ${entry.tag}` : reason;
      });
      return { message: "O modelo tem erro de sintaxe nas variáveis.", items };
    }
    case "template_raw_xml_forbidden":
      return {
        message: "Variáveis com @ ({{@...}}) não são permitidas.",
        items: payloadArray(error, "tags").map((tag) => `{{@${String(tag)}}}`),
      };
    case "template_tag_invalid":
      return {
        message: "Use só variáveis do catálogo, como {{cliente.nome}}: sem filtros, cálculos ou letras maiúsculas.",
        items: payloadArray(error, "tags").map((tag) => `{{${String(tag)}}}`),
      };
    case "template_variable_kind_mismatch":
      return {
        message: "Variável usada de forma incompatível: texto vai como {{variavel}}; sim/não e listas vão em bloco {{#variavel}}...{{/variavel}}.",
        items: payloadArray(error, "tags").map((item) => String((item as { tag?: string }).tag ?? item)),
      };
    case "template_render_failed":
      return { message: "O modelo não passou na geração de teste com dados de exemplo.", items: [] };
    case "template_validation_timeout":
    case "template_too_complex":
      return { message: "O modelo é complexo demais para ser processado. Simplifique o arquivo e envie de novo.", items: [] };
    case "template_name_taken":
      return { message: "Já existe um modelo ativo com este nome.", items: [] };
    case "case_type_name_taken":
      return { message: "Já existe um tipo de caso ativo com este nome.", items: [] };
    case "template_not_allowed":
      return { message: "Só é possível vincular modelos ativos deste cliente.", items: [] };
    case "default_template_not_linked":
      return { message: "O modelo padrão precisa estar entre os modelos vinculados.", items: [] };
    case "template_variable_not_found":
      return { message: "A variável não existe nesta versão do modelo. Recarregue a tela.", items: [] };
    default:
      return null;
  }
}

export function describeTemplateError(error: KanbanApiError): string | null {
  const details = templateErrorDetails(error);
  if (!details) {
    return null;
  }
  return details.items.length > 0 ? `${details.message} ${details.items.join("; ")}` : details.message;
}

// ---------------------------------------------------------------------------
// Formulario do tipo de caso.
// ---------------------------------------------------------------------------

export interface CaseTypeForm {
  name: string;
  description: string;
  classificationCriteria: string;
  expectedEvidence: string;
  templateIds: string[];
  defaultTemplateId: string | null;
}

export const EMPTY_CASE_TYPE_FORM: CaseTypeForm = {
  name: "",
  description: "",
  classificationCriteria: "",
  expectedEvidence: "",
  templateIds: [],
  defaultTemplateId: null,
};

export function caseTypeToForm(caseType: CaseTypeDto): CaseTypeForm {
  return {
    name: caseType.name,
    description: caseType.description ?? "",
    classificationCriteria: caseType.classificationCriteria ?? "",
    expectedEvidence: caseType.expectedEvidence ?? "",
    templateIds: caseType.templates.map((template) => template.id),
    defaultTemplateId: caseType.defaultTemplateId,
  };
}

/**
 * Marca/desmarca modelo vinculado. O primeiro modelo marcado vira o padrao;
 * desmarcar o padrao passa o padrao para o primeiro restante (ou nenhum).
 */
export function toggleCaseTypeTemplate(form: CaseTypeForm, templateId: string, checked: boolean): CaseTypeForm {
  const templateIds = checked
    ? [...new Set([...form.templateIds, templateId])]
    : form.templateIds.filter((id) => id !== templateId);
  let defaultTemplateId = form.defaultTemplateId;
  if (defaultTemplateId && !templateIds.includes(defaultTemplateId)) {
    defaultTemplateId = templateIds[0] ?? null;
  }
  if (!defaultTemplateId && templateIds.length > 0) {
    defaultTemplateId = templateIds[0];
  }
  return { ...form, templateIds, defaultTemplateId };
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function buildCaseTypePayload(form: CaseTypeForm): CaseTypePayload {
  return {
    name: form.name.trim(),
    description: optional(form.description),
    classificationCriteria: optional(form.classificationCriteria),
    expectedEvidence: optional(form.expectedEvidence),
    templateIds: form.templateIds,
    defaultTemplateId: form.defaultTemplateId && form.templateIds.includes(form.defaultTemplateId) ? form.defaultTemplateId : null,
  };
}

/** So as variaveis cuja marca obrigatoria/opcional mudou. */
export function variableRequirementChanges(
  variables: TemplateVariableDto[],
  edited: Record<string, boolean>
): Array<{ key: string; required: boolean }> {
  return variables
    .filter((variable) => edited[variable.key] !== undefined && edited[variable.key] !== variable.required)
    .map((variable) => ({ key: variable.key, required: edited[variable.key] }));
}
