import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export type CardDocumentStatus = 'enviado' | 'aceito' | 'rejeitado';
export type ChecklistItemState = 'pendente' | CardDocumentStatus;

/** Campo de texto do multipart do envio; o arquivo vai no campo `file`. */
export class UploadCardDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  documentTypeId!: string;
}

export class ReviewCardDocumentDto {
  @ApiProperty({ enum: ['aceito', 'rejeitado'] })
  @IsIn(['aceito', 'rejeitado'])
  status!: 'aceito' | 'rejeitado';

  @ApiPropertyOptional({ maxLength: 1000, description: 'Obrigatorio quando status = rejeitado' })
  @ValidateIf((dto: ReviewCardDocumentDto) => dto.status === 'rejeitado' || dto.rejectionReason !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'rejectionReason is required to reject a document' })
  @MaxLength(1000)
  rejectionReason?: string;
}

export interface CardDocumentAttachmentResponse {
  id: string;
  activityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CardDocumentResponse {
  id: string;
  cardId: string;
  documentTypeId: string;
  status: CardDocumentStatus;
  rejectionReason: string | null;
  reviewedByIdentityId: string | null;
  reviewedAt: string | null;
  createdByIdentityId: string;
  createdAt: string;
  attachment: CardDocumentAttachmentResponse;
}

export interface ChecklistCompleteness {
  acceptedRequired: number;
  totalRequired: number;
  complete: boolean;
}

export interface CardChecklistItemResponse {
  documentTypeId: string;
  name: string;
  required: boolean;
  sortOrder: number;
  /** Tipo desativado so aparece quando o card tem envio dele; nao conta na completude. */
  active: boolean;
  state: ChecklistItemState;
  current: CardDocumentResponse | null;
  /** Todos os envios do item, do mais recente para o mais antigo (inclui `current`). */
  history: CardDocumentResponse[];
}

export interface CardChecklistResponse {
  items: CardChecklistItemResponse[];
  completeness: ChecklistCompleteness;
  /** Card em coluna com `requires_complete_checklist` e obrigatorio pendente (Sprint 3). */
  checklistPending: boolean;
  canUpload: boolean;
  canReview: boolean;
}

export interface PendingDocumentType {
  id: string;
  name: string;
}
