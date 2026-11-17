import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Consumidor Final' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  documentNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  // Endereço — obrigatório para emissão de NFe (destinatário)
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(9)
  addressZip?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  addressStreet?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  addressNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  addressComplement?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  addressNeighborhood?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  addressCity?: string | null;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  addressState?: string | null;

  @ApiPropertyOptional({ description: 'Código IBGE do município (7 dígitos)' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  addressIbgeCode?: string | null;

  // Campos fiscais — necessários para NFe com destinatário PJ
  @ApiPropertyOptional({ description: 'Inscrição Estadual' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ie?: string | null;

  @ApiPropertyOptional({
    enum: ['1', '2', '9'],
    description: '1=Contribuinte ICMS, 2=Contribuinte isento, 9=Não contribuinte'
  })
  @IsOptional()
  @IsIn(['1', '2', '9'])
  indIeDest?: string | null;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
