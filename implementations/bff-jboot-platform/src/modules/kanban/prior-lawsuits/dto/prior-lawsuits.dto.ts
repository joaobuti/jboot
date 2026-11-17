import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddPriorLawsuitDto {
  @ApiProperty({ maxLength: 200, description: 'Banco reu da acao ja ajuizada' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bank!: string;

  @ApiProperty({ maxLength: 40, description: 'Numero do processo no padrao CNJ, com ou sem mascara' })
  @IsString()
  @MaxLength(40)
  processNumber!: string;
}

export class PriorLawsuitDto {
  @ApiProperty() id!: string;
  @ApiProperty() bank!: string;
  @ApiProperty({ description: 'NNNNNNN-DD.AAAA.J.TR.OOOO' }) processNumber!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true, type: String }) createdByName!: string | null;
}

export class PriorLawsuitDeclarationDto {
  @ApiProperty() declaredAt!: string;
  @ApiProperty({ nullable: true, type: String }) declaredByName!: string | null;
  @ApiProperty({ enum: ['manual', 'default'], description: 'default: marcada pelo Flow no cadastro do cliente; manual: confirmada por uma pessoa' })
  origin!: 'manual' | 'default';
}

export type PriorLawsuitHistoryKind = 'lawsuit_added' | 'lawsuit_removed' | 'declared_none' | 'declaration_revoked';

export class PriorLawsuitHistoryItemDto {
  @ApiProperty({ enum: ['lawsuit_added', 'lawsuit_removed', 'declared_none', 'declaration_revoked'] })
  kind!: PriorLawsuitHistoryKind;
  @ApiProperty() at!: string;
  @ApiProperty({ nullable: true, type: String }) byName!: string | null;
  @ApiPropertyOptional() bank?: string;
  @ApiPropertyOptional() processNumber?: string;
  @ApiPropertyOptional({ enum: ['lawsuit_added', 'withdrawn'] }) reason?: 'lawsuit_added' | 'withdrawn';
  @ApiPropertyOptional({ enum: ['manual', 'default'], description: 'Somente em declared_none' }) origin?: 'manual' | 'default';
}

export type PriorLawsuitsStatus = 'listed' | 'declared_none' | 'missing';

export class PriorLawsuitsDto {
  @ApiProperty() customerId!: string;
  @ApiProperty({
    enum: ['listed', 'declared_none', 'missing'],
    description:
      'listed: ha acoes; declared_none: sem acoes anteriores (marcado por padrao no cadastro ou confirmado por uma pessoa); ' +
      'missing: nem lista nem confirmacao'
  })
  status!: PriorLawsuitsStatus;
  @ApiProperty({ type: [PriorLawsuitDto] }) lawsuits!: PriorLawsuitDto[];
  @ApiProperty({ type: PriorLawsuitDeclarationDto, nullable: true }) declaration!: PriorLawsuitDeclarationDto | null;
  @ApiProperty({ type: [PriorLawsuitHistoryItemDto], description: 'Mais recente primeiro' }) history!: PriorLawsuitHistoryItemDto[];
}
