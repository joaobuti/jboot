import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, Matches, ValidateNested } from 'class-validator';

export class InitialStockItemDto {
  @ApiProperty()
  @IsUUID()
  locationId!: string;

  @ApiProperty({ example: '10.000' })
  @IsString()
  quantity!: string;
}

const moneyPattern = /^[0-9]+(\.[0-9]{1,2})?$/;

export class CreateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string | null;

  @ApiPropertyOptional({ example: '73181500' })
  @IsOptional()
  @IsString()
  @Length(8, 8)
  @Matches(/^\d{8}$/)
  ncm?: string | null;

  @ApiPropertyOptional({ example: '5102' })
  @IsOptional()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  cfop?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(7, 7)
  @Matches(/^\d{7}$/)
  cest?: string | null;

  @ApiPropertyOptional({ description: 'GTIN numerico ou null para SEM GTIN' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,14}$/)
  gtin?: string | null;

  @ApiProperty({ example: 'Café 500g' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: 'UN' })
  @IsString()
  @MaxLength(16)
  unit!: string;

  @ApiProperty({ example: '19.90' })
  @IsString()
  @Matches(moneyPattern)
  salePrice!: string;

  @ApiPropertyOptional({ example: '12.50' })
  @IsOptional()
  @IsString()
  @Matches(moneyPattern)
  costPrice?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visibleInPdv?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  visibleInCardapio?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  visibleInComanda?: boolean;

  @ApiPropertyOptional({ enum: ['cozinha', 'bar'], description: 'Obrigatorio quando visibleInComanda=true' })
  @IsOptional()
  @IsIn(['cozinha', 'bar'])
  queueType?: 'cozinha' | 'bar';

  @ApiPropertyOptional({ type: [InitialStockItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialStockItemDto)
  initialStock?: InitialStockItemDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
