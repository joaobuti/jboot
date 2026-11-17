import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateClientApplicationDto {
  @ApiProperty()
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional({ enum: ['active', 'trial', 'suspended', 'cancelled'] })
  @IsOptional()
  @IsIn(['active', 'trial', 'suspended', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateClientApplicationDto {
  @ApiPropertyOptional({ enum: ['active', 'trial', 'suspended', 'cancelled'] })
  @IsOptional()
  @IsIn(['active', 'trial', 'suspended', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
