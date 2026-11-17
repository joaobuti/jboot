import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsObject, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CUSTOMER_DOCUMENT_TYPES, CustomerDocumentType } from '../../customer-documents/customer-document-catalog';
import { KitGender, KitWaiverCourt } from '../kit-tag-values';

export class PutCustomerValidationSettingsDto {
  @ApiProperty({ description: 'Agente claude_routine da identidade central que salva a configuracao.' })
  @IsUUID()
  agentId!: string;
}

/** Agente de rotina da conta Claude do escritorio (ADR 018); null volta para a conta principal. */
export class PutOfficeValidationSettingsDto {
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  @ValidateIf((dto: PutOfficeValidationSettingsDto) => dto.agentId !== null)
  @IsUUID()
  agentId!: string | null;
}

export class RequestCustomerValidationDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Escritorio escolhido quando o cliente tem mais de um' })
  @IsOptional()
  @IsUUID()
  officeId?: string;
}

/** Documentos que a rotina de validacao pode ler (ADR 019, decisao 3); ao menos um. */
export class PutValidationDocumentPolicyDto {
  @ApiProperty({ type: [String], enum: CUSTOMER_DOCUMENT_TYPES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CUSTOMER_DOCUMENT_TYPES, { each: true })
  documentTypes!: CustomerDocumentType[];
}

/** Revisao humana dos valores do kit (ADR 019). Valor vazio = tag sem valor. */
export class PutKitReviewDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  @IsObject()
  values!: Record<string, string>;

  @ApiProperty({ enum: ['masculino', 'feminino'], nullable: true })
  @ValidateIf((dto: PutKitReviewDto) => dto.gender !== null)
  @IsIn(['masculino', 'feminino'])
  gender!: KitGender | null;

  @ApiProperty({ enum: ['jec', 'jef'], nullable: true })
  @ValidateIf((dto: PutKitReviewDto) => dto.waiverCourt !== null)
  @IsIn(['jec', 'jef'])
  waiverCourt!: KitWaiverCourt | null;
}

/** Board de entrada do escritorio; null remove (o card deixa de ser criado para esse escritorio). */
export class PutIntakeBoardDto {
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  @ValidateIf((dto: PutIntakeBoardDto) => dto.boardId !== null)
  @IsUUID()
  boardId!: string | null;
}
