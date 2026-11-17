export interface FiscalConfigResponse {
  id: string;
  clientId: string;
  cnpjEmitente: string;
  ambiente: 'homologacao' | 'producao';
  serieNfce: number;
  serieNfe: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  inscricaoEstadual: string;
  telefone: string | null;
  email: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoMunicipio: string;
  cscConfigured: boolean;
  cscId: string | null;
  regimeFiscal: string;
  cfopPadraoNfce: string | null;
  cfopPadraoNfe: string | null;
  icmsOrigemPadrao: number | null;
  icmsCstPadrao: string | null;
  icmsAliquotaPadrao: number | null;
  pisCstPadrao: string | null;
  pisAliquotaPadrao: number | null;
  cofinsCstPadrao: string | null;
  cofinsAliquotaPadrao: number | null;
}

export interface UpsertFiscalConfigDto {
  cnpjEmitente: string;
  ambiente: 'homologacao' | 'producao';
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoEstadual: string;
  telefone?: string;
  email?: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoMunicipio: string;
  serieNfce?: number;
  serieNfe?: number;
  csc?: string;
  cscId?: string;
  regimeFiscal?: string;
  cfopPadraoNfce?: string;
  cfopPadraoNfe?: string;
  icmsOrigemPadrao?: number;
  icmsCstPadrao?: string;
  icmsAliquotaPadrao?: number;
  pisCstPadrao?: string;
  pisAliquotaPadrao?: number;
  cofinsCstPadrao?: string;
  cofinsAliquotaPadrao?: number;
}

export interface UploadFiscalCertificateDto {
  cnpjEmitente: string;
  ambiente: 'homologacao' | 'producao';
  pfxBase64: string;
  pfxPassword: string;
}
