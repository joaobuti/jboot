/** Contrato de resposta do `svc-jboot-juridico-data` (ADR 009), compartilhado pelo Juridico e pelo acompanhamento de processos (ADR 021). */

export interface TribunalDto {
  sigla: string;
  nome: string;
}

export interface TribunalListDto {
  items: TribunalDto[];
  total: number;
}

export interface CodeNameDto {
  codigo: string | number | null;
  nome: string;
}

export interface MovementComplementDto {
  codigo?: string | number | null;
  nome?: string | null;
  valor?: string | null;
  descricao?: string | null;
}

export interface MovementDto {
  codigo: number | null;
  nome: string;
  dataHora: string | null;
  orgaoJulgador: CodeNameDto | null;
  complementos: MovementComplementDto[];
}

export interface ProcessDto {
  numeroProcesso: string;
  tribunal: string;
  /** Identificador do processo no indice do CNJ (ex: TJSC_JE_5006004...). */
  datajudId: string | null;
  grau: string | null;
  dataAjuizamento: string | null;
  dataUltimaAtualizacao: string | null;
  /** `@timestamp` do indice: sincronizacao do CNJ, nao data processual. */
  sincronizadoEm: string | null;
  nivelSigilo: 0;
  classe: CodeNameDto | null;
  formato: CodeNameDto | null;
  sistema: CodeNameDto | null;
  orgaoJulgador: CodeNameDto | null;
  assuntos: CodeNameDto[];
  movimentacoes: MovementDto[];
}

export interface InternalProcessResponseDto {
  requestId: string;
  source: 'datajud';
  capturedAt: string;
  process: ProcessDto;
}

export interface ProblemDto {
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
}

export interface QueryJuridicoDataProcessInput {
  numeroProcesso: string;
  tribunal?: string | null;
}

/** Comunicacao do DJEN normalizada pelo `svc-jboot-juridico-data` (texto ainda em HTML do provedor). */
export interface DjenCommunicationDto {
  hash: string;
  comunicacaoId?: number | null;
  numeroComunicacao?: number | null;
  numeroProcesso?: string | null;
  siglaTribunal?: string | null;
  nomeOrgao?: string | null;
  tipoComunicacao?: string | null;
  tipoDocumento?: string | null;
  nomeClasse?: string | null;
  link?: string | null;
  texto?: string | null;
  dataDisponibilizacao?: string | null;
}

export interface DjenCommunicationPageDto {
  items: DjenCommunicationDto[];
  count: number;
  page: number;
  pageSize: number;
}
