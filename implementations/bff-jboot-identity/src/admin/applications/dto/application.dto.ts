import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({ example: 'erp' })
  @IsString()
  slug: string;

  @ApiProperty({ example: 'ERP' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'app:erp' })
  @IsString()
  tokenAudience: string;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tokenAudience?: string;

  @ApiPropertyOptional({ enum: ['active', 'disabled', 'deprecated'] })
  @IsOptional()
  @IsIn(['active', 'disabled', 'deprecated'])
  status?: string;
}
