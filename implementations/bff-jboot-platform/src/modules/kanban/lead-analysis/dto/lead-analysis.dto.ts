import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { TemplateWarning } from '../../document-templates/docx-package';
import { LeadStatus } from '../../leads/lead-state';
import { VariableOrigin } from '../generation-data';
import { GeneratedDocumentOrigin, GeneratedDocumentStatus, PdfStatus } from '../lead-analysis.repository';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Mesmo intervalo dos motivos auditados da S3/S3.5/S4 (aparado). */
export const ANALYSIS_REASON_MIN_LENGTH = 10;
export const ANALYSIS_REASON_MAX_LENGTH = 500;

// ---------------------------------------------------------------- entrada

export class AddLeadCaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  caseTypeId!: string;
}

export class ChangeLeadCaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  caseTypeId!: string;

  @ApiProperty({ minLength: ANALYSIS_REASON_MIN_LENGTH, maxLength: ANALYSIS_REASON_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(ANALYSIS_REASON_MIN_LENGTH)
  @MaxLength(ANALYSIS_REASON_MAX_LENGTH)
  reason!: string;
}

export class RemoveLeadCaseDto {
  @ApiProperty({ minLength: ANALYSIS_REASON_MIN_LENGTH, maxLength: ANALYSIS_REASON_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(ANALYSIS_REASON_MIN_LENGTH)
  @MaxLength(ANALYSIS_REASON_MAX_LENGTH)
  reason!: string;
}

export class GenerateLeadDocumentDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Modelo vinculado ao tipo de caso; ausente = modelo padrao do tipo' })
  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export const DOCUMENT_FORMATS = ['docx', 'pdf'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export class DocumentDownloadQueryDto {
  @ApiPropertyOptional({ enum: DOCUMENT_FORMATS, default: 'docx' })
  @IsOptional()
  @IsIn(DOCUMENT_FORMATS)
  format?: DocumentFormat;
}

// ---------------------------------------------------------------- saida

export interface PdfStateResponse {
  status: PdfStatus;
  attempts: number;
  errorCode: string | null;
  completedAt: string | null;
}

export interface DocumentVariableResponse {
  key: string;
  label: string;
  origin: VariableOrigin;
  required: boolean;
  filled: boolean;
}

/** Documento na visao do GESTOR (`flow:admin`): todas as versoes, origem das variaveis, sem valores. */
export interface GeneratedDocumentResponse {
  id: string;
  caseId: string;
  version: number;
  origin: GeneratedDocumentOrigin;
  status: GeneratedDocumentStatus;
  basedOnDocumentId: string | null;
  templateId: string;
  templateName: string;
  templateVersionId: string;
  templateVersion: number;
  templateSha256: string;
  catalogVersion: number;
  sizeBytes: number;
  createdByIdentityId: string;
  createdByName: string | null;
  createdAt: string;
  approvedByIdentityId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  pdf: PdfStateResponse | null;
  missingOptional: string[];
  variables: DocumentVariableResponse[];
}

export interface LeadCaseResponse {
  id: string;
  caseTypeId: string;
  caseTypeName: string;
  caseTypeActive: boolean;
  source: 'manual' | 'ai';
  decidedByIdentityId: string;
  decidedByName: string | null;
  decidedAt: string;
  replacesCaseId: string | null;
  supersededAt: string | null;
  supersededByName: string | null;
  supersededReason: string | null;
  documents: GeneratedDocumentResponse[];
}

export interface AnalysisTemplateOption {
  id: string;
  name: string;
  isDefault: boolean;
  usable: boolean;
  /** Motivo de nao poder gerar (`template_inactive`, `template_without_version`, `template_version_not_usable`). */
  unusableReason: string | null;
}

export interface AnalysisCaseTypeOption {
  id: string;
  name: string;
  templates: AnalysisTemplateOption[];
}

export interface LeadAnalysisResponse {
  cardId: string;
  leadStatus: LeadStatus;
  submissionId: string | null;
  /** Gestor pode classificar/gerar/aprovar (estado `enviado`, `aguardando_revisao` ou `aprovado`). */
  analysisOpen: boolean;
  caseTypes: AnalysisCaseTypeOption[];
  cases: LeadCaseResponse[];
  removedCases: LeadCaseResponse[];
}

/** Documento ENTREGUE na visao do escritorio (P11): sem tipo de caso, sem variaveis, sem historico. */
export interface DeliveredDocumentResponse {
  id: string;
  title: string;
  version: number;
  editedByManager: boolean;
  approvedAt: string;
  pdfStatus: 'ready' | 'pending';
}

export interface LeadDeliveredDocumentsResponse {
  cardId: string;
  leadStatus: LeadStatus;
  documents: DeliveredDocumentResponse[];
}

export interface GeneratedDocumentDownloadResponse {
  url: string;
  expiresAt: string;
  fileName: string;
}

export interface EditedVersionResponse {
  analysis: LeadAnalysisResponse;
  documentId: string;
  warnings: TemplateWarning[];
}
