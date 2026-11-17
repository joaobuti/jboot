// Dado juridico do cliente final atendido pelo Flow (ADR 013, tabela customer_juridico).
// Campos sao a versao inicial; a lista final depende de validacao com o cliente.
export interface CustomerJuridico {
  customerId: string;
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
  createdAt: string;
  updatedAt: string;
}

// Patch: campo ausente (undefined) preserva o valor; null limpa (exceto
// hipossuficienciaDeclarada, que e boolean obrigatorio).
export type CustomerJuridicoInput = Partial<
  Omit<CustomerJuridico, 'customerId' | 'createdAt' | 'updatedAt' | 'hipossuficienciaDeclarada'>
> & { hipossuficienciaDeclarada?: boolean };

/** Campos que a IA pode preencher a partir dos documentos (so quando vazios na ficha). */
export const CUSTOMER_JURIDICO_FILLABLE_FIELDS = [
  'dataNascimento',
  'nacionalidade',
  'estadoCivil',
  'profissao',
  'rgNumero',
  'rgOrgaoEmissor',
  'rgUf',
  'nomeMae',
  'numeroBeneficio',
  'especieBeneficio',
  'bancoPagamento'
] as const;

export type CustomerJuridicoFillableField = (typeof CUSTOMER_JURIDICO_FILLABLE_FIELDS)[number];
export type CustomerJuridicoFillInput = Partial<Record<CustomerJuridicoFillableField, string>>;
