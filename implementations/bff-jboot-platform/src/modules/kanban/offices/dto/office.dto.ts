import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from 'class-validator';

import { BRAZIL_UFS, BrazilUf } from '../../lawyers/lawyer.input';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Mesmo intervalo do motivo de override da Sprint 3 (aparado). */
export const OFFICE_TRANSFER_REASON_MIN_LENGTH = 10;
export const OFFICE_TRANSFER_REASON_MAX_LENGTH = 500;

export class CreateOfficeDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, description: 'Cidade do escritorio: local do fecho da peticao (com uf)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ enum: BRAZIL_UFS, nullable: true })
  @IsOptional()
  @IsIn(BRAZIL_UFS)
  uf?: BrazilUf | null;
}

/** Inativar = `active: false`; escritorio nunca e apagado. */
export class UpdateOfficeDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** So `true`: marca este como principal e desmarca o anterior (sempre ha no maximo um). */
  @ApiPropertyOptional({ description: 'Marca como escritorio principal (desmarca o anterior)' })
  @IsOptional()
  @IsIn([true])
  isPrincipal?: true;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, description: 'Cidade do escritorio: local do fecho da peticao (com uf)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ enum: BRAZIL_UFS, nullable: true })
  @IsOptional()
  @IsIn(BRAZIL_UFS)
  uf?: BrazilUf | null;
}

/** Conjunto completo de escritorios do usuario (substitui o atual). */
export class ReplaceUserOfficesDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  officeIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 50,
    description: 'Escritorios (dentre officeIds) em que o usuario e responsavel; ausente mantem as marcacoes atuais.'
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  responsibleOfficeIds?: string[];
}

export class UpdateOfficeSettingsDto {
  @ApiProperty()
  @IsBoolean()
  officeVisibilityEnabled!: boolean;
}

/** Atribuicao em lote: cards SEM escritorio do quadro (todos, ou so `cardIds`). */
export class AssignBoardCardsOfficeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  officeId!: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 500 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  cardIds?: string[];
}

export class TransferCardOfficeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  officeId!: string;

  @ApiProperty({ minLength: OFFICE_TRANSFER_REASON_MIN_LENGTH, maxLength: OFFICE_TRANSFER_REASON_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(OFFICE_TRANSFER_REASON_MIN_LENGTH)
  @MaxLength(OFFICE_TRANSFER_REASON_MAX_LENGTH)
  reason!: string;
}

export interface OfficeResponse {
  id: string;
  name: string;
  active: boolean;
}

export interface OfficeContextResponse {
  officeVisibilityEnabled: boolean;
  isAdmin: boolean;
  /** Escritorios atuais do usuario. */
  userOfficeIds: string[];
  /** Admin: todos os escritorios do tenant; demais: so os proprios. */
  offices: OfficeResponse[];
}

export interface FlowUserManagementContextResponse {
  officeAssignmentMode: 'selectable' | 'inherited';
  offices: Array<{ id: string; name: string }>;
  /** So `flow:admin` atribui mais de um escritorio a um usuario (flow-offices-sprints.md, S2). */
  multipleOffices: boolean;
}

export interface OfficeUserResponse {
  identityId: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  officeIds: string[];
  /** Escritorios em que o usuario e responsavel (ADR 018). */
  responsibleOfficeIds: string[];
}

export interface RemovedAssignmentResponse {
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
  officeId: string;
}

export interface ReplaceUserOfficesResponse {
  identityId: string;
  officeIds: string[];
  added: string[];
  removed: string[];
  /** Cards dos escritorios que o usuario deixou e dos quais saiu como responsavel (P28). */
  removedAssignments: RemovedAssignmentResponse[];
  /** Responsavel marcado: permissoes de IA concedidas no Identity (null = nao se aplica). */
  aiPermissionsGranted?: boolean | null;
}

export interface OfficeSettingsResponse {
  officeVisibilityEnabled: boolean;
  enabledAt: string | null;
  enabledByIdentityId: string | null;
  activeOfficeCount: number;
  cardsWithoutOffice: { total: number; byBoard: Array<{ boardId: string; boardName: string; count: number }> };
  /** Usuarios do Flow sem escritorio e sem `flow:admin`: deixam de ver cards com a chave ligada. */
  usersWithoutOffice: Array<{ identityId: string; displayName: string | null }>;
}

export interface TransferCardOfficeResponse {
  cardId: string;
  fromOfficeId: string | null;
  officeId: string;
  changed: boolean;
}

export class ChooseActiveOfficeDto {
  @ApiProperty({ description: 'Escritorio (do proprio usuario) em que ele passa a atuar' })
  @IsUUID()
  officeId!: string;
}
