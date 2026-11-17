import { TemplateVariableRow } from '../document-templates/document-templates.repository';
import {
  buildTemplateData,
  CatalogVariable,
  findCatalogVariable,
  TemplateData,
  TemplateDataSource,
  TemplateItem,
  TemplateScalar,
  TemplateVariableSource
} from '../document-templates/template-variable-catalog';

/**
 * Dados de UMA geracao (CRM de leads, Sprint 6; ADR 014, Decisoes 1 e 4; R5, R7).
 *
 * Regra das fontes (decisao da S6, registrada no artefato):
 * - `cliente.*` vem do SNAPSHOT do envio atual (`kanban_lead_submissions.customer_snapshot`):
 *   e o cadastro validado e congelado que o escritorio enviou (P21). Alteracao
 *   posterior do cadastro compartilhado por outro caminho NAO entra no
 *   documento; o card mostra "cadastro alterado depois do envio" (S4) e o
 *   gestor devolve o lead para o escritorio reenviar, se o dado novo valer;
 * - `escritorio.nome` = escritorio ATUAL do card (P29);
 * - `lead.data_envio*` = data do envio atual; `lead.casos` = casos ativos do
 *   ciclo, na ordem de decisao; `caso.tipo` = caso do documento;
 * - `data.*` = momento da geracao (fuso de Brasilia).
 *
 * `filled_variables` grava, para cada variavel do modelo, valor, origem e a
 * marca obrigatoria vigente (R7). Obrigatoria sem valor bloqueia a geracao
 * (lista devolvida ao gestor); opcional sem valor sai como `[PREENCHER: campo]`.
 */

export type VariableOrigin = 'cadastro_enviado' | 'escritorio' | 'lead' | 'caso' | 'sistema';

export interface FilledVariable {
  value: TemplateScalar | TemplateItem[];
  origin: VariableOrigin;
  required: boolean;
  filled: boolean;
}

export interface GenerationInputs {
  /** Cadastro achatado do envio (`flattenLeadCustomer`). */
  snapshot: Record<string, unknown>;
  submittedAt: string | null;
  officeName: string | null;
  /** Casos ativos do ciclo, na ordem de decisao. */
  caseTypeNames: string[];
  currentCaseTypeName: string;
  today: Date;
}

export interface ResolvedGeneration {
  data: TemplateData;
  filledVariables: Record<string, FilledVariable>;
  missingRequired: string[];
  missingOptional: string[];
}

const ORIGIN_BY_SOURCE: Record<TemplateVariableSource, VariableOrigin> = {
  cliente: 'cadastro_enviado',
  cliente_juridico: 'cadastro_enviado',
  escritorio: 'escritorio',
  lead: 'lead',
  caso: 'caso',
  sistema: 'sistema'
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
}

/** Fonte de dados do catalogo a partir do snapshot do envio + contexto atual. */
export function sourceFromSubmission(inputs: GenerationInputs): TemplateDataSource {
  const s = inputs.snapshot;
  return {
    customer: {
      name: text(s.name),
      documentNumber: text(s.documentNumber),
      email: text(s.email),
      phone: text(s.phone),
      addressZip: text(s.addressZip),
      addressStreet: text(s.addressStreet),
      addressNumber: text(s.addressNumber),
      addressComplement: text(s.addressComplement),
      addressNeighborhood: text(s.addressNeighborhood),
      addressCity: text(s.addressCity),
      addressState: text(s.addressState)
    },
    juridico: {
      dataNascimento: text(s['juridico.dataNascimento']),
      nacionalidade: text(s['juridico.nacionalidade']),
      estadoCivil: text(s['juridico.estadoCivil']),
      profissao: text(s['juridico.profissao']),
      rgNumero: text(s['juridico.rgNumero']),
      rgOrgaoEmissor: text(s['juridico.rgOrgaoEmissor']),
      rgUf: text(s['juridico.rgUf']),
      nomeMae: text(s['juridico.nomeMae']),
      numeroBeneficio: text(s['juridico.numeroBeneficio']),
      especieBeneficio: text(s['juridico.especieBeneficio']),
      bancoPagamento: text(s['juridico.bancoPagamento']),
      hipossuficienciaDeclarada: s['juridico.hipossuficienciaDeclarada'] === true
    },
    office: inputs.officeName ? { name: inputs.officeName } : null,
    lead: {
      submittedAt: inputs.submittedAt,
      cases: inputs.caseTypeNames.map((caseTypeName) => ({ caseTypeName }))
    },
    currentCase: { caseTypeName: inputs.currentCaseTypeName },
    today: inputs.today
  };
}

function isEmpty(variable: CatalogVariable, value: TemplateScalar | TemplateItem[]): boolean {
  if (variable.valueType === 'collection') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (variable.valueType === 'boolean') {
    return false;
  }
  return value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Valores das variaveis DO MODELO (versao `valid`, entao todas conhecidas).
 * Campo de item de colecao (`lead.casos[].tipo`) segue a colecao.
 */
export function resolveGeneration(source: TemplateDataSource, variables: readonly TemplateVariableRow[]): ResolvedGeneration {
  const data = buildTemplateData(source);
  const filledVariables: Record<string, FilledVariable> = {};
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  for (const row of variables) {
    if (row.key.includes('[]')) {
      continue;
    }
    const variable = findCatalogVariable(row.key);
    if (!variable) {
      // Versao `valid` nao tem variavel desconhecida; se aparecer, bloqueia como obrigatoria.
      missingRequired.push(row.key);
      continue;
    }
    const [namespace, field] = variable.key.split('.');
    const value = data[namespace]?.[field] ?? null;
    const empty = isEmpty(variable, value);
    filledVariables[row.key] = { value, origin: ORIGIN_BY_SOURCE[variable.source], required: row.required, filled: !empty };
    if (empty) {
      (row.required ? missingRequired : missingOptional).push(row.key);
    }
  }
  return { data, filledVariables, missingRequired: missingRequired.sort(), missingOptional: missingOptional.sort() };
}

/** Rotulo do catalogo para a lista de campos faltantes (chave desconhecida volta como veio). */
export function variableLabel(key: string): string {
  return findCatalogVariable(key)?.label ?? key;
}
