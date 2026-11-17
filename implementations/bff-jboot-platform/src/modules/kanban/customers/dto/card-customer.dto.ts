import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import { IsCpf } from '../../../shared/documents/cpf';

const UF_PATTERN = /^[A-Z]{2}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- entrada

export class CardCustomerLookupDto {
  @ApiProperty({ description: 'CPF com ou sem mascara; validado por digitos verificadores' })
  @IsCpf()
  cpf!: string;
}

/**
 * Dado geral do cliente (nucleo `establishment-customers`) editavel pelo Flow.
 * Sem CPF (o CPF e a chave de busca do vinculo) e sem campos fiscais de PDV.
 * Em edicao, `null` e rejeitado: o servico de clientes preserva o valor atual
 * para campo ausente e nao suporta limpar dado geral (semantica COALESCE).
 */
class CardCustomerContactAddressDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(9)
  addressZip?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  addressStreet?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  addressNumber?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  addressComplement?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  addressNeighborhood?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  addressCity?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(UF_PATTERN)
  addressState?: string;
}

// `name` fica fora da base: `ValidateIf` herdado desligaria a obrigatoriedade na criacao.
export class CardCustomerCoreUpdateDto extends CardCustomerContactAddressDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
}

/** Criacao: mesmo conjunto do dado geral, com nome obrigatorio. */
export class CardCustomerCoreCreateDto extends CardCustomerContactAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}

/**
 * Dado juridico (`customer_juridico`). Patch: campo ausente preserva, `null`
 * limpa (exceto `hipossuficienciaDeclarada`, boolean obrigatorio).
 */
export class CardCustomerJuridicoDto {
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Matches(ISO_DATE_PATTERN)
  @IsDateString({ strict: true })
  dataNascimento?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nacionalidade?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  estadoCivil?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  profissao?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  rgNumero?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  rgOrgaoEmissor?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'SP' })
  @IsOptional()
  @Matches(UF_PATTERN)
  rgUf?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeMae?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroBeneficio?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  especieBeneficio?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bancoPagamento?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  hipossuficienciaDeclarada?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacoes?: string | null;
}

/** Limites do motivo do override (CRM de leads, Sprint 3). Medidos depois do trim. */
export const OVERRIDE_REASON_MIN_LENGTH = 10;
export const OVERRIDE_REASON_MAX_LENGTH = 500;

/**
 * Override do admin do tenant (`flow:admin`): vincula cliente EXISTENTE fora dos
 * quadros do usuario. O motivo e o unico texto livre que vai para o evento e a
 * auditoria; nunca e logado.
 */
export class CardCustomerOverrideDto {
  @ApiProperty({ minLength: OVERRIDE_REASON_MIN_LENGTH, maxLength: OVERRIDE_REASON_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(OVERRIDE_REASON_MIN_LENGTH)
  @MaxLength(OVERRIDE_REASON_MAX_LENGTH)
  reason!: string;
}

/**
 * Vincular ou trocar o cliente do card por CPF. CPF novo exige `customer`
 * (cria nucleo + `customer_juridico`); CPF existente e visivel vincula o
 * existente e ignora `customer`/`juridico`; existente fora dos quadros do
 * usuario e bloqueado (409 `customer_outside_boards`), salvo `override` de
 * `flow:admin` (Sprint 3): so vale quando a resolucao da `outside_boards`;
 * CPF sem cliente com override responde 422 `override_requires_existing_customer`
 * (nunca cria); cliente visivel ignora o override (vinculo normal).
 */
export class LinkCardCustomerDto {
  @ApiProperty({ description: 'CPF com ou sem mascara' })
  @IsCpf()
  cpf!: string;

  @ApiPropertyOptional({ type: CardCustomerCoreCreateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardCustomerCoreCreateDto)
  customer?: CardCustomerCoreCreateDto;

  @ApiPropertyOptional({ type: CardCustomerJuridicoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardCustomerJuridicoDto)
  juridico?: CardCustomerJuridicoDto;

  @ApiPropertyOptional({ type: CardCustomerOverrideDto, description: 'Somente `flow:admin`; sem o scope responde 403 `override_not_allowed`' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardCustomerOverrideDto)
  override?: CardCustomerOverrideDto;
}

export class UpdateCardCustomerDto {
  @ApiPropertyOptional({ type: CardCustomerCoreUpdateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardCustomerCoreUpdateDto)
  customer?: CardCustomerCoreUpdateDto;

  @ApiPropertyOptional({ type: CardCustomerJuridicoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardCustomerJuridicoDto)
  juridico?: CardCustomerJuridicoDto;
}

// ---------------------------------------------------------------- saida

export interface CardCustomerJuridicoView {
  dataNascimento: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  rgNumero: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  nomeMae: string | null;
  numeroBeneficio: string | null;
  especieBeneficio: string | null;
  bancoPagamento: string | null;
  hipossuficienciaDeclarada: boolean;
  observacoes: string | null;
}

/** Cliente final exibido no Flow: campos explicitos, sem dado fiscal de PDV. */
export interface CardCustomerView {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  juridico: CardCustomerJuridicoView | null;
}

export interface CardCustomerLinkView {
  createdByIdentityId: string;
  createdAt: string;
}

export interface CardCustomerPanelResponse {
  customer: CardCustomerView | null;
  link: CardCustomerLinkView | null;
  canEdit: boolean;
}

export type CardCustomerLinkOutcome = 'created' | 'linked' | 'unchanged';

export interface CardCustomerLinkResponse extends CardCustomerPanelResponse {
  outcome: CardCustomerLinkOutcome;
}

/**
 * `outside_boards` nunca carrega dado: nem id, nem nome. `canOverride: true`
 * so aparece para `flow:admin` (a tela oferece o vinculo com motivo); para os
 * demais a resposta continua sendo so o status.
 */
export type CardCustomerLookupResponse =
  | { status: 'not_found' }
  // `crossOffice` (Sprint 3.5, P30): cliente visivel, mas sem card no escritorio deste card;
  // vincular exige o override do `flow:admin` com motivo (`canOverride` so para ele).
  | { status: 'found'; customer: CardCustomerView; crossOffice?: true; canOverride?: true }
  | { status: 'outside_boards'; canOverride?: true };
