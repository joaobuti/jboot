import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import { LEAD_STATUSES, LeadStatus } from '../lead-state';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Mesmo intervalo dos motivos auditados da Sprint 3/3.5 (aparado). */
export const LEAD_RETURN_REASON_MIN_LENGTH = 10;
export const LEAD_RETURN_REASON_MAX_LENGTH = 500;

// ---------------------------------------------------------------- entrada

export class ReturnLeadDto {
  @ApiProperty({ minLength: LEAD_RETURN_REASON_MIN_LENGTH, maxLength: LEAD_RETURN_REASON_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(LEAD_RETURN_REASON_MIN_LENGTH)
  @MaxLength(LEAD_RETURN_REASON_MAX_LENGTH)
  reason!: string;
}

export class ListLeadQueueQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  boardId?: string;

  @ApiPropertyOptional({ enum: LEAD_STATUSES })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  submittedFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  submittedTo?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  offset = 0;
}

/** Conjunto completo de campos obrigatorios do envio (substitui o atual); chaves da whitelist. */
export class UpdateLeadSettingsDto {
  @ApiProperty({ type: [String], maxItems: 40 })
  @IsArray()
  @ArrayMaxSize(40)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  requiredFields!: string[];
}

// ---------------------------------------------------------------- saida

export interface LeadPendingDocument {
  id: string;
  name: string;
  /** Estado atual do item: `pendente` (nunca enviado) ou `rejeitado`. */
  state: 'pendente' | 'rejeitado';
}

export interface LeadReadiness {
  complete: boolean;
  customerLinked: boolean;
  /** Chaves de `lead-fields.ts` sem valor no cadastro do cliente vinculado. */
  missingFields: string[];
  pendingDocumentTypes: LeadPendingDocument[];
}

export interface LeadIncompleteError extends Omit<LeadReadiness, 'complete'> {
  code: 'lead_incomplete';
  message: string;
}

export interface LeadSubmissionResponse {
  id: string;
  officeId: string | null;
  submittedByIdentityId: string;
  submittedByName: string | null;
  submittedAt: string;
  returnedByIdentityId: string | null;
  returnedByName: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}

export interface CardLeadResponse {
  cardId: string;
  status: LeadStatus;
  /** Captacao de leads ligada no quadro (PE1). */
  leadIntakeEnabled: boolean;
  /** Dados do lead editaveis (rascunho/devolvido); falso = congelado (P21). */
  editable: boolean;
  canSubmit: boolean;
  canReturn: boolean;
  /** So quando o lead pode ser enviado (captacao ligada e estado editavel). */
  readiness: LeadReadiness | null;
  currentSubmission: LeadSubmissionResponse | null;
  /**
   * Cadastro do cliente mudou depois do envio (por outro caminho: cadastro
   * compartilhado). So nomes de campo. `null` sem envio atual ou com o lead
   * editavel (o proximo envio grava snapshot novo).
   */
  customerSnapshot: { outdated: boolean; changedFields: string[]; customerChanged: boolean } | null;
  history: LeadSubmissionResponse[];
}

export interface LeadQueueItemResponse {
  cardId: string;
  boardId: string;
  boardName: string;
  cardTitle: string;
  officeId: string | null;
  officeName: string | null;
  status: LeadStatus;
  submissionId: string | null;
  submittedByIdentityId: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}

export interface LeadSettingsResponse {
  requiredFields: string[];
  /** `false` = default P16 (tenant nunca configurou). */
  configured: boolean;
  configuredAt: string | null;
  availableFields: string[];
  defaultRequiredFields: string[];
}
