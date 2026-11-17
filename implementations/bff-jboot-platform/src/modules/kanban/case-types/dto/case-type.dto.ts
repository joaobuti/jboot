import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Texto opcional aparado; vazio vira `null` (limpa o campo). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const CASE_TYPE_NAME_MAX = 160;
export const CASE_TYPE_DESCRIPTION_MAX = 2000;
export const CASE_TYPE_CRITERIA_MAX = 8000;
export const CASE_TYPE_EVIDENCE_MAX = 4000;
export const CASE_TYPE_TEMPLATES_MAX = 50;

export class CreateCaseTypeDto {
  @ApiProperty({ maxLength: CASE_TYPE_NAME_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CASE_TYPE_NAME_MAX)
  name!: string;

  @ApiPropertyOptional({ maxLength: CASE_TYPE_DESCRIPTION_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CASE_TYPE_DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: CASE_TYPE_CRITERIA_MAX, nullable: true, description: 'Criterios de classificacao em texto livre.' })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CASE_TYPE_CRITERIA_MAX)
  classificationCriteria?: string | null;

  @ApiPropertyOptional({ maxLength: CASE_TYPE_EVIDENCE_MAX, nullable: true, description: 'Evidencias/documentos esperados.' })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CASE_TYPE_EVIDENCE_MAX)
  expectedEvidence?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: CASE_TYPE_TEMPLATES_MAX })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASE_TYPE_TEMPLATES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  templateIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Precisa estar em templateIds.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  defaultTemplateId?: string | null;
}

/** Campos ausentes mantem o valor; `null` limpa os opcionais. Sem exclusao: `active: false`. */
export class UpdateCaseTypeDto {
  @ApiPropertyOptional({ maxLength: CASE_TYPE_NAME_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CASE_TYPE_NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ maxLength: CASE_TYPE_DESCRIPTION_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CASE_TYPE_DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: CASE_TYPE_CRITERIA_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CASE_TYPE_CRITERIA_MAX)
  classificationCriteria?: string | null;

  @ApiPropertyOptional({ maxLength: CASE_TYPE_EVIDENCE_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CASE_TYPE_EVIDENCE_MAX)
  expectedEvidence?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: CASE_TYPE_TEMPLATES_MAX })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASE_TYPE_TEMPLATES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  templateIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  defaultTemplateId?: string | null;
}

export interface CaseTypeResponse {
  id: string;
  name: string;
  description: string | null;
  classificationCriteria: string | null;
  expectedEvidence: string | null;
  active: boolean;
  defaultTemplateId: string | null;
  templates: Array<{ id: string; name: string; active: boolean }>;
  createdAt: string;
  updatedAt: string;
}
