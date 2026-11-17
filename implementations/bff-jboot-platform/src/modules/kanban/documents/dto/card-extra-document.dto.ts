import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadCardExtraDocumentDto {
  @ApiPropertyOptional({ maxLength: 200, description: 'Descricao opcional; vazia vira nula' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @MaxLength(200)
  description?: string;
}

export interface CardExtraDocumentResponse {
  id: string;
  description: string | null;
  createdByIdentityId: string;
  createdAt: string;
  attachment: { id: string; activityId: string; fileName: string; contentType: string; sizeBytes: number };
  /** Quem enviou ou quem revisa documentos no quadro, com envio liberado no card. */
  canRemove: boolean;
}

export interface CardExtraDocumentsResponse {
  documents: CardExtraDocumentResponse[];
  canUpload: boolean;
}
