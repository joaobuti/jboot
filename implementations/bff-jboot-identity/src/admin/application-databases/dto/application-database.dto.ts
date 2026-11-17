import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateApplicationDatabaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  databaseId?: string;

  @ApiPropertyOptional({ enum: ['primary', 'read_replica', 'analytics', 'audit', 'vector'] })
  @IsOptional()
  @IsIn(['primary', 'read_replica', 'analytics', 'audit', 'vector'])
  role?: string;

  @ApiProperty({ enum: ['none', 'shared_db', 'schema_per_client', 'dedicated_database'] })
  @IsIn(['none', 'shared_db', 'schema_per_client', 'dedicated_database'])
  isolationStrategy: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateApplicationDatabaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  databaseId?: string;

  @ApiPropertyOptional({ enum: ['none', 'shared_db', 'schema_per_client', 'dedicated_database'] })
  @IsOptional()
  @IsIn(['none', 'shared_db', 'schema_per_client', 'dedicated_database'])
  isolationStrategy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
