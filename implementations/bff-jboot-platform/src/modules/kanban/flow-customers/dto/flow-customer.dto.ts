import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import { IsCpf } from '../../../shared/documents/cpf';

export class FlowCustomerJuridicoDto {
  @IsOptional() @IsString() @MaxLength(10) dataNascimento?: string | null;
  @IsOptional() @IsString() @MaxLength(80) nacionalidade?: string | null;
  @IsOptional() @IsString() @MaxLength(40) estadoCivil?: string | null;
  @IsOptional() @IsString() @MaxLength(120) profissao?: string | null;
  @IsOptional() @IsString() @MaxLength(40) rgNumero?: string | null;
  @IsOptional() @IsString() @MaxLength(120) rgOrgaoEmissor?: string | null;
  @IsOptional() @IsString() @Length(2, 2) rgUf?: string | null;
  @IsOptional() @IsString() @MaxLength(200) nomeMae?: string | null;
  @IsOptional() @IsString() @MaxLength(80) numeroBeneficio?: string | null;
  @IsOptional() @IsString() @MaxLength(80) especieBeneficio?: string | null;
  @IsOptional() @IsString() @MaxLength(120) bancoPagamento?: string | null;
  @IsOptional() @IsBoolean() hipossuficienciaDeclarada?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) observacoes?: string | null;
}

export class CreateFlowCustomerDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  /** CPF obrigatorio (ADR 017): nomeia a pasta no Drive e identifica o cliente na validacao. */
  @ApiProperty() @IsCpf() documentNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(180) email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  /** Obrigatorio so para quem escolhe o escritorio (`flow:admin`/`flow:customers:offices`); os demais usam o escritorio ativo. */
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('4', { each: true }) officeIds!: string[];
  @ApiPropertyOptional({ type: FlowCustomerJuridicoDto })
  @IsOptional() @ValidateNested() @Type(() => FlowCustomerJuridicoDto) juridico?: FlowCustomerJuridicoDto;
}

export class UpdateFlowCustomerDto extends PartialType(OmitType(CreateFlowCustomerDto, ['documentNumber'] as const)) {
  /** Omitido mantem o atual; `null` (apagar) e recusado: CPF e obrigatorio (ADR 017). */
  @ApiPropertyOptional() @ValidateIf((dto: { documentNumber?: unknown }) => dto.documentNumber !== undefined) @IsCpf()
  documentNumber?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
  @ApiPropertyOptional({ description: 'Obrigatorio ao remover ou ampliar vinculos de escritorio.' })
  @IsOptional() @IsString() @Length(10, 500) officeLinkReason?: string;
}

export class ListFlowCustomersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class CreateCardFromCustomerDto {
  @IsUUID() boardId!: string;
  @IsUUID() columnId!: string;
  @IsUUID() officeId!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) title!: string;
}

export class LinkExistingCardDto {
  @IsUUID() boardId!: string;
}
