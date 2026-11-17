/**
 * Catalogo fixo dos documentos da ficha do cliente (ADR 017; decisao do usuario
 * em 2026-10-16, a partir da lista do contratante). Uploads sao opcionais para
 * salvar o cliente e obrigatorios para validar.
 */
export const CUSTOMER_DOCUMENT_TYPES = [
  'identidade',
  'cpf',
  'comprovante_residencia',
  'declaracao_residencia_terceiro',
  'extrato_beneficio',
  'promobank',
  'hiscred'
] as const;

export type CustomerDocumentType = (typeof CUSTOMER_DOCUMENT_TYPES)[number];

export const CUSTOMER_DOCUMENT_LABELS: Record<CustomerDocumentType, string> = {
  identidade: 'RG ou CNH',
  cpf: 'CPF',
  comprovante_residencia: 'Comprovante de residência atual',
  declaracao_residencia_terceiro: 'Declaração de residência de terceiros (assinada)',
  extrato_beneficio: 'HISCON — Histórico de Consignado',
  promobank: 'Promobank — Extrato de Empréstimos',
  hiscred: 'HISCRED — Histórico de Crédito'
};

/** Formatos aceitos na ficha: o agente le imagem; PDF e convertido em imagem antes (S2). */
export const CUSTOMER_DOCUMENT_CONTENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

export function isCustomerDocumentType(value: string): value is CustomerDocumentType {
  return (CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Perfil da ficha que muda o que e exigido para validar. */
export interface CustomerDocumentRequirements {
  /** Comprovante de residencia em nome de terceiro: exige a declaracao assinada. */
  residenceProofThirdParty: boolean;
  /** RG novo ou CNH ja trazem o CPF: o documento CPF deixa de ser exigido. */
  cpfOnIdentity: boolean;
}

export const DEFAULT_DOCUMENT_REQUIREMENTS: CustomerDocumentRequirements = {
  residenceProofThirdParty: false,
  cpfOnIdentity: false
};

export function sameRequirements(a: CustomerDocumentRequirements, b: CustomerDocumentRequirements): boolean {
  return a.residenceProofThirdParty === b.residenceProofThirdParty && a.cpfOnIdentity === b.cpfOnIdentity;
}

/**
 * Extrato de emprestimos para validar (docs/product/flow-customer-promobank-sprints.md, 2026-11-02): HISCON
 * ou Promobank, um dos dois. O HISCON continua exigido para avancar o card (Analise de Acoes e Peticoes).
 */
export const EXTRACT_ALTERNATIVES: readonly CustomerDocumentType[] = ['extrato_beneficio', 'promobank'];

/**
 * Documentos que as automacoes leem mesmo fora da validacao confirmada: o HISCON enviado depois de validar
 * com o Promobank nao reabre a validacao e libera a Analise de Acoes.
 */
export const LATE_DOCUMENT_TYPES: readonly CustomerDocumentType[] = ['extrato_beneficio'];

/** Exigidos um a um. Declaracao so com comprovante de terceiro; CPF dispensado quando a identidade ja o traz. */
export function requiredCustomerDocumentTypes(requirements: CustomerDocumentRequirements): CustomerDocumentType[] {
  return CUSTOMER_DOCUMENT_TYPES.filter((type) => {
    if (EXTRACT_ALTERNATIVES.includes(type)) return false;
    if (type === 'declaracao_residencia_terceiro') return requirements.residenceProofThirdParty;
    if (type === 'cpf') return !requirements.cpfOnIdentity;
    return true;
  });
}

/** Sem HISCON nem Promobank, a falta aparece como `extrato_beneficio` (o extrato que vale para todas as etapas). */
export function missingCustomerDocumentTypes(
  present: ReadonlySet<CustomerDocumentType>,
  requirements: CustomerDocumentRequirements
): CustomerDocumentType[] {
  const required = new Set(requiredCustomerDocumentTypes(requirements));
  const noExtract = !EXTRACT_ALTERNATIVES.some((type) => present.has(type));
  return CUSTOMER_DOCUMENT_TYPES.filter((type) =>
    type === 'extrato_beneficio' ? noExtract : required.has(type) && !present.has(type)
  );
}
