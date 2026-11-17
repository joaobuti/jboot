import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import { TemplateWarning } from '../docx-package';
import { TemplateValueType } from '../template-variable-catalog';
import { TemplateVersionStatus } from '../document-templates.repository';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const TEMPLATE_NAME_MAX = 160;
export const TEMPLATE_DESCRIPTION_MAX = 2000;

export class CreateDocumentTemplateDto {
  @ApiProperty({ maxLength: TEMPLATE_NAME_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_NAME_MAX)
  name!: string;

  @ApiPropertyOptional({ maxLength: TEMPLATE_DESCRIPTION_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(TEMPLATE_DESCRIPTION_MAX)
  description?: string | null;
}

/** Sem exclusao: inativar = `active: false`. O arquivo muda so por versao nova. */
export class UpdateDocumentTemplateDto {
  @ApiPropertyOptional({ maxLength: TEMPLATE_NAME_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ maxLength: TEMPLATE_DESCRIPTION_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(TEMPLATE_DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class TemplateVariableRequirementDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  key!: string;

  @ApiProperty()
  @IsBoolean()
  required!: boolean;
}

export class UpdateTemplateVariablesDto {
  @ApiProperty({ type: [TemplateVariableRequirementDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableRequirementDto)
  variables!: TemplateVariableRequirementDto[];
}

export interface TemplateVersionSummaryResponse {
  id: string;
  version: number;
  validationStatus: TemplateVersionStatus;
  createdAt: string;
}

export interface DocumentTemplateResponse {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  currentVersion: TemplateVersionSummaryResponse | null;
  caseTypeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariableResponse {
  key: string;
  known: boolean;
  valueType: TemplateValueType | null;
  /** Rotulo do catalogo (variavel conhecida). */
  label: string | null;
  required: boolean;
}

export interface TemplateVersionResponse {
  id: string;
  templateId: string;
  version: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  catalogVersion: number;
  validationStatus: TemplateVersionStatus;
  /** A geracao (S6) so usa a versao ATUAL e somente se ela for `valid`. */
  usableForGeneration: boolean;
  isCurrent: boolean;
  unknownVariables: string[];
  warnings: TemplateWarning[];
  uploadedByIdentityId: string;
  createdAt: string;
}

export interface TemplateVersionDetailResponse extends TemplateVersionResponse {
  variables: TemplateVariableResponse[];
}

export interface DocumentTemplateDetailResponse extends DocumentTemplateResponse {
  versions: TemplateVersionResponse[];
  /** Detalhe da versao atual (variaveis), ou `null` sem versao. */
  current: TemplateVersionDetailResponse | null;
  caseTypes: Array<{ id: string; name: string; active: boolean; isDefault: boolean }>;
}

export interface TemplateDownloadResponse {
  url: string;
  expiresAt: string;
}
