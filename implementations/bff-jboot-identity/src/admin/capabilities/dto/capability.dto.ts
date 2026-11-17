import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CapabilityCatalogQueryDto {
  @ApiPropertyOptional({ description: 'Filtra o catalogo pelos sub-modulos de uma application' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  applicationSlug?: string;
}

export class SetClientCapabilityDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  slug: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class SetClientCapabilitiesDto {
  @ApiProperty({ type: [SetClientCapabilityDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SetClientCapabilityDto)
  capabilities: SetClientCapabilityDto[];
}
