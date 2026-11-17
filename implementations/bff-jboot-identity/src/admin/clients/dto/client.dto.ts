import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ enum: ['person', 'company', 'public_agency'] })
  @IsIn(['person', 'company', 'public_agency'])
  clientType: string;

  @ApiPropertyOptional({ enum: ['cpf', 'cnpj'] })
  @IsOptional()
  @IsIn(['cpf', 'cnpj'])
  documentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9]{11}$|^[0-9]{14}$/)
  documentNumber?: string;

  @ApiProperty()
  @IsString()
  legalName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ description: 'Mensalidade do contratante em reais (informativa)', type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  monthlyFee?: number | null;
}

export class UpdateClientDto {
  @ApiPropertyOptional({ enum: ['person', 'company', 'public_agency'] })
  @IsOptional()
  @IsIn(['person', 'company', 'public_agency'])
  clientType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: string;

  @ApiPropertyOptional({ description: 'Mensalidade do contratante em reais (informativa)', type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  monthlyFee?: number | null;
}
