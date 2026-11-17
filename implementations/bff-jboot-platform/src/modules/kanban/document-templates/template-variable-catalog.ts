/**
 * Catalogo de variaveis dos modelos `.docx` (CRM de leads, Sprint 5; ADR 014,
 * Decisao 1). Fonte UNICA, versionada em codigo:
 *
 * - o upload so aceita tags deste catalogo (desconhecida = versao
 *   `invalid_variables`, inutilizavel na geracao);
 * - cada versao de modelo grava `TEMPLATE_CATALOG_VERSION`;
 * - a formatacao (mascara de CPF/CEP/telefone, data `dd/mm/aaaa`, data por
 *   extenso) e feita AQUI; o modelo nao tem filtros nem expressoes;
 * - `buildTemplateData` monta o objeto de dados a partir das fontes (cadastro
 *   do cliente, escritorio do card, lead, caso e data). A S6 usa a mesma funcao
 *   para gerar o documento; a S5 so a usa com `SYNTHETIC_TEMPLATE_SOURCE` no
 *   render de prova.
 *
 * Mudanca que remove variavel, troca o tipo ou muda a formatacao de uma
 * variavel existente exige incrementar `TEMPLATE_CATALOG_VERSION`. Acrescentar
 * variavel nova tambem incrementa (versoes antigas foram validadas sem ela).
 */
export const TEMPLATE_CATALOG_VERSION = 1;

export type TemplateValueType = 'text' | 'boolean' | 'collection';
export type TemplateVariableSource = 'cliente' | 'cliente_juridico' | 'escritorio' | 'lead' | 'caso' | 'sistema';

/** Gramatica do caminho da tag (ADR 014): so letras minusculas, digitos e `_`, segmentos por ponto. */
export const TEMPLATE_PATH_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export const TEMPLATE_TIME_ZONE = 'America/Sao_Paulo';

/** Fontes de dados de UMA geracao. Datas do cadastro em `YYYY-MM-DD`; envio em ISO. */
export interface TemplateDataSource {
  customer: {
    name: string | null;
    documentNumber: string | null;
    email: string | null;
    phone: string | null;
    addressZip: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    addressNeighborhood: string | null;
    addressCity: string | null;
    addressState: string | null;
  };
  juridico: {
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
  } | null;
  /** Escritorio do card (P29: fase 1 so o nome). */
  office: { name: string } | null;
  lead: {
    submittedAt: string | null;
    /** Casos do lead (P3: N casos por lead), na ordem de decisao. */
    cases: Array<{ caseTypeName: string }>;
  };
  /** Caso para o qual o documento e gerado (S6). */
  currentCase: { caseTypeName: string } | null;
  today: Date;
}

export type TemplateScalar = string | boolean | null;
export type TemplateItem = Record<string, string | null>;

interface CatalogBase {
  key: string;
  label: string;
  description: string;
  source: TemplateVariableSource;
}

export interface ScalarCatalogVariable extends CatalogBase {
  valueType: 'text' | 'boolean';
  resolve: (source: TemplateDataSource) => TemplateScalar;
}

export interface CollectionItemField {
  key: string;
  label: string;
  description: string;
}

export interface CollectionCatalogVariable extends CatalogBase {
  valueType: 'collection';
  items: readonly CollectionItemField[];
  resolve: (source: TemplateDataSource) => TemplateItem[];
}

export type CatalogVariable = ScalarCatalogVariable | CollectionCatalogVariable;

export interface CatalogNamespace {
  key: string;
  label: string;
  description: string;
}

export const TEMPLATE_NAMESPACES: readonly CatalogNamespace[] = [
  { key: 'cliente', label: 'Cliente', description: 'Cadastro do cliente vinculado ao card (nucleo e dados juridicos).' },
  { key: 'escritorio', label: 'Escritorio', description: 'Escritorio do card (cadastro de escritorios do Flow).' },
  { key: 'lead', label: 'Lead', description: 'Envio do lead e os casos decididos para ele.' },
  { key: 'caso', label: 'Caso', description: 'Caso para o qual o documento e gerado.' },
  { key: 'data', label: 'Data', description: 'Data da geracao do documento (horario de Brasilia).' }
];

// ---------------------------------------------------------------------------
// Formatacao (pura, sem dependencia de locale do processo).
// ---------------------------------------------------------------------------

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function digitsOf(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** `00000000000` ou `000.000.000-00` -> `000.000.000-00`; outro formato volta aparado. */
export function formatCpf(value: string | null | undefined): string | null {
  const digits = digitsOf(value);
  if (digits.length !== 11) {
    return clean(value);
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCep(value: string | null | undefined): string | null {
  const digits = digitsOf(value);
  if (digits.length !== 8) {
    return clean(value);
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** DDD + 8 ou 9 digitos -> `(11) 1234-5678` / `(11) 91234-5678`. */
export function formatPhone(value: string | null | undefined): string | null {
  const digits = digitsOf(value);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return clean(value);
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** `YYYY-MM-DD` (prefixo de ISO tambem serve) -> partes; data inexistente = null. */
function parseIsoDate(value: string | null | undefined): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** `YYYY-MM-DD` -> `dd/mm/aaaa`. */
export function formatDateBr(value: string | null | undefined): string | null {
  const parts = parseIsoDate(value);
  if (!parts) {
    return null;
  }
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

/** `YYYY-MM-DD` -> `5 de marco de 1960` (dia 1 = `1º`). */
export function formatDateExtenso(value: string | null | undefined): string | null {
  const parts = parseIsoDate(value);
  if (!parts) {
    return null;
  }
  const day = parts.day === 1 ? '1º' : String(parts.day);
  return `${day} de ${MONTHS[parts.month - 1]} de ${parts.year}`;
}

/** Data civil (`YYYY-MM-DD`) de um instante no fuso de Brasilia. */
export function isoDateInTimeZone(instant: Date, timeZone = TEMPLATE_TIME_ZONE): string | null {
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function submittedDate(source: TemplateDataSource): string | null {
  return source.lead.submittedAt ? isoDateInTimeZone(new Date(source.lead.submittedAt)) : null;
}

/** Endereco numa linha: `Rua X, 100, Apto 1, Centro, Cidade/UF, CEP 00000-000` (partes vazias omitidas). */
export function formatFullAddress(customer: TemplateDataSource['customer']): string | null {
  const street = clean(customer.addressStreet);
  if (!street) {
    return null;
  }
  const city = clean(customer.addressCity);
  const state = clean(customer.addressState);
  const cityState = city && state ? `${city}/${state}` : (city ?? state);
  const zip = formatCep(customer.addressZip);
  return [
    street,
    clean(customer.addressNumber),
    clean(customer.addressComplement),
    clean(customer.addressNeighborhood),
    cityState,
    zip ? `CEP ${zip}` : null
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Catalogo.
// ---------------------------------------------------------------------------

function text(
  key: string,
  label: string,
  description: string,
  source: TemplateVariableSource,
  resolve: (source: TemplateDataSource) => string | null
): ScalarCatalogVariable {
  return { key, label, description, source, valueType: 'text', resolve };
}

const juridico = (source: TemplateDataSource) => source.juridico;

export const TEMPLATE_VARIABLE_CATALOG: readonly CatalogVariable[] = [
  text('cliente.nome', 'Nome', 'Nome completo do cliente.', 'cliente', (s) => clean(s.customer.name)),
  text('cliente.cpf', 'CPF', 'CPF com mascara 000.000.000-00.', 'cliente', (s) => formatCpf(s.customer.documentNumber)),
  text('cliente.email', 'E-mail', 'E-mail do cliente.', 'cliente', (s) => clean(s.customer.email)),
  text('cliente.telefone', 'Telefone', 'Telefone com DDD, formato (00) 00000-0000.', 'cliente', (s) =>
    formatPhone(s.customer.phone)
  ),
  text('cliente.endereco_cep', 'CEP', 'CEP com mascara 00000-000.', 'cliente', (s) => formatCep(s.customer.addressZip)),
  text('cliente.endereco_logradouro', 'Logradouro', 'Rua, avenida etc.', 'cliente', (s) => clean(s.customer.addressStreet)),
  text('cliente.endereco_numero', 'Numero', 'Numero do endereco.', 'cliente', (s) => clean(s.customer.addressNumber)),
  text('cliente.endereco_complemento', 'Complemento', 'Complemento do endereco.', 'cliente', (s) =>
    clean(s.customer.addressComplement)
  ),
  text('cliente.endereco_bairro', 'Bairro', 'Bairro.', 'cliente', (s) => clean(s.customer.addressNeighborhood)),
  text('cliente.endereco_cidade', 'Cidade', 'Cidade.', 'cliente', (s) => clean(s.customer.addressCity)),
  text('cliente.endereco_uf', 'UF', 'Sigla do estado.', 'cliente', (s) => clean(s.customer.addressState)),
  text(
    'cliente.endereco_completo',
    'Endereco completo',
    'Endereco numa linha: logradouro, numero, complemento, bairro, cidade/UF e CEP (partes vazias omitidas).',
    'cliente',
    (s) => formatFullAddress(s.customer)
  ),
  text('cliente.data_nascimento', 'Data de nascimento', 'Formato dd/mm/aaaa.', 'cliente_juridico', (s) =>
    formatDateBr(juridico(s)?.dataNascimento)
  ),
  text(
    'cliente.data_nascimento_extenso',
    'Data de nascimento por extenso',
    'Ex.: 5 de março de 1960.',
    'cliente_juridico',
    (s) => formatDateExtenso(juridico(s)?.dataNascimento)
  ),
  text('cliente.nacionalidade', 'Nacionalidade', 'Nacionalidade.', 'cliente_juridico', (s) =>
    clean(juridico(s)?.nacionalidade)
  ),
  text('cliente.estado_civil', 'Estado civil', 'Estado civil.', 'cliente_juridico', (s) => clean(juridico(s)?.estadoCivil)),
  text('cliente.profissao', 'Profissao', 'Profissao.', 'cliente_juridico', (s) => clean(juridico(s)?.profissao)),
  text('cliente.rg_numero', 'RG', 'Numero do RG.', 'cliente_juridico', (s) => clean(juridico(s)?.rgNumero)),
  text('cliente.rg_orgao_emissor', 'Orgao emissor do RG', 'Orgao emissor do RG.', 'cliente_juridico', (s) =>
    clean(juridico(s)?.rgOrgaoEmissor)
  ),
  text('cliente.rg_uf', 'UF do RG', 'UF de emissao do RG.', 'cliente_juridico', (s) => clean(juridico(s)?.rgUf)),
  text('cliente.nome_mae', 'Nome da mae', 'Nome da mae.', 'cliente_juridico', (s) => clean(juridico(s)?.nomeMae)),
  text('cliente.numero_beneficio', 'Numero do beneficio', 'Numero do beneficio (NB).', 'cliente_juridico', (s) =>
    clean(juridico(s)?.numeroBeneficio)
  ),
  text('cliente.especie_beneficio', 'Especie do beneficio', 'Especie do beneficio.', 'cliente_juridico', (s) =>
    clean(juridico(s)?.especieBeneficio)
  ),
  text('cliente.banco_pagamento', 'Banco de pagamento', 'Banco de pagamento do beneficio.', 'cliente_juridico', (s) =>
    clean(juridico(s)?.bancoPagamento)
  ),
  {
    key: 'cliente.hipossuficiente',
    label: 'Hipossuficiencia declarada',
    description: 'Condicional: {{#cliente.hipossuficiente}}...{{/cliente.hipossuficiente}} (ou {{^...}} para o caso contrario).',
    source: 'cliente_juridico',
    valueType: 'boolean',
    resolve: (s) => juridico(s)?.hipossuficienciaDeclarada === true
  },
  text('escritorio.nome', 'Nome do escritorio', 'Escritorio do card (P29: fase 1 so o nome).', 'escritorio', (s) =>
    clean(s.office?.name)
  ),
  text('lead.data_envio', 'Data do envio', 'Data em que o lead foi enviado para analise, dd/mm/aaaa.', 'lead', (s) =>
    formatDateBr(submittedDate(s))
  ),
  text('lead.data_envio_extenso', 'Data do envio por extenso', 'Ex.: 12 de outubro de 2026.', 'lead', (s) =>
    formatDateExtenso(submittedDate(s))
  ),
  {
    key: 'lead.casos',
    label: 'Casos do lead',
    description: 'Laco sobre os casos do lead (P3): {{#lead.casos}}{{ordem}}. {{tipo}}{{/lead.casos}}.',
    source: 'lead',
    valueType: 'collection',
    items: [
      { key: 'ordem', label: 'Ordem', description: 'Posicao do caso na lista (1, 2, 3...).' },
      { key: 'tipo', label: 'Tipo de caso', description: 'Nome do tipo de caso.' }
    ],
    resolve: (s) => s.lead.cases.map((item, index) => ({ ordem: String(index + 1), tipo: clean(item.caseTypeName) }))
  },
  text('caso.tipo', 'Tipo de caso', 'Tipo do caso para o qual o documento e gerado.', 'caso', (s) =>
    clean(s.currentCase?.caseTypeName)
  ),
  text('data.hoje', 'Data de hoje', 'Data da geracao, dd/mm/aaaa.', 'sistema', (s) => formatDateBr(isoDateInTimeZone(s.today))),
  text('data.hoje_extenso', 'Data de hoje por extenso', 'Ex.: 12 de outubro de 2026.', 'sistema', (s) =>
    formatDateExtenso(isoDateInTimeZone(s.today))
  )
];

const CATALOG_BY_KEY = new Map(TEMPLATE_VARIABLE_CATALOG.map((variable) => [variable.key, variable]));

export function findCatalogVariable(key: string): CatalogVariable | null {
  return CATALOG_BY_KEY.get(key) ?? null;
}

/** Chave persistida para campo de item de colecao: `lead.casos[].tipo`. */
export function collectionItemKey(collectionKey: string, itemKey: string): string {
  return `${collectionKey}[].${itemKey}`;
}

/** Dados sinteticos (sem pessoa real) para o render de prova e os exemplos da tela. */
export const SYNTHETIC_TEMPLATE_SOURCE: TemplateDataSource = Object.freeze({
  customer: {
    name: 'Maria Exemplo da Silva',
    documentNumber: '12345678909',
    email: 'maria.exemplo@example.com',
    phone: '11912345678',
    addressZip: '01001000',
    addressStreet: 'Rua Exemplo',
    addressNumber: '100',
    addressComplement: 'Apto 12',
    addressNeighborhood: 'Centro',
    addressCity: 'Sao Paulo',
    addressState: 'SP'
  },
  juridico: {
    dataNascimento: '1960-03-05',
    nacionalidade: 'brasileira',
    estadoCivil: 'casada',
    profissao: 'aposentada',
    rgNumero: '12.345.678-9',
    rgOrgaoEmissor: 'SSP',
    rgUf: 'SP',
    nomeMae: 'Joana Exemplo',
    numeroBeneficio: '123.456.789-0',
    especieBeneficio: 'Aposentadoria por idade',
    bancoPagamento: 'Banco Exemplo',
    hipossuficienciaDeclarada: true
  },
  office: { name: 'Escritorio Exemplo' },
  lead: {
    submittedAt: '2026-10-12T13:00:00.000Z',
    cases: [{ caseTypeName: 'Tipo de caso exemplo A' }, { caseTypeName: 'Tipo de caso exemplo B' }]
  },
  currentCase: { caseTypeName: 'Tipo de caso exemplo A' },
  today: new Date('2026-10-12T13:00:00.000Z')
});

export type TemplateData = Record<string, Record<string, TemplateScalar | TemplateItem[]>>;

/** Objeto de dados do modelo (`{ cliente: { nome, ... }, lead: { casos: [...] }, ... }`). */
export function buildTemplateData(source: TemplateDataSource): TemplateData {
  const data: TemplateData = {};
  for (const variable of TEMPLATE_VARIABLE_CATALOG) {
    const [namespace, field] = variable.key.split('.');
    data[namespace] ??= {};
    data[namespace][field] = variable.resolve(source);
  }
  return data;
}

export interface CatalogVariableResponse {
  key: string;
  label: string;
  description: string;
  valueType: TemplateValueType;
  source: TemplateVariableSource;
  /** Trecho pronto para colar no Word. */
  usage: string;
  /** Valor formatado com os dados sinteticos (nunca dado real). */
  example: string | boolean | null;
  items?: Array<CollectionItemField & { example: string | null }>;
}

export interface TemplateCatalogResponse {
  catalogVersion: number;
  delimiters: { start: string; end: string };
  namespaces: Array<CatalogNamespace & { variables: CatalogVariableResponse[] }>;
}

function usageOf(variable: CatalogVariable): string {
  if (variable.valueType === 'boolean') {
    return `{{#${variable.key}}}...{{/${variable.key}}}`;
  }
  if (variable.valueType === 'collection') {
    const fields = variable.items.map((item) => `{{${item.key}}}`).join(' ');
    return `{{#${variable.key}}}${fields}{{/${variable.key}}}`;
  }
  return `{{${variable.key}}}`;
}

export function templateCatalogResponse(): TemplateCatalogResponse {
  const sample = buildTemplateData(SYNTHETIC_TEMPLATE_SOURCE);
  return {
    catalogVersion: TEMPLATE_CATALOG_VERSION,
    delimiters: { start: '{{', end: '}}' },
    namespaces: TEMPLATE_NAMESPACES.map((namespace) => ({
      ...namespace,
      variables: TEMPLATE_VARIABLE_CATALOG.filter((variable) => variable.key.startsWith(`${namespace.key}.`)).map(
        (variable) => {
          const [ns, field] = variable.key.split('.');
          const value = sample[ns][field];
          const base = {
            key: variable.key,
            label: variable.label,
            description: variable.description,
            valueType: variable.valueType,
            source: variable.source,
            usage: usageOf(variable)
          };
          if (variable.valueType === 'collection') {
            const first = (value as TemplateItem[])[0] ?? {};
            return {
              ...base,
              example: null,
              items: variable.items.map((item) => ({ ...item, example: first[item.key] ?? null }))
            };
          }
          return { ...base, example: value as TemplateScalar };
        }
      )
    }))
  };
}
