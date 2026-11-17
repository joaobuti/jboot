import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateDatabaseDto {
  @ApiProperty()
  @IsString()
  slug: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['postgres', 'mongodb', 'mysql', 'mssql', 'clickhouse', 'qdrant'] })
  @IsIn(['postgres', 'mongodb', 'mysql', 'mssql', 'clickhouse', 'qdrant'])
  engine: string;

  @ApiProperty()
  @IsString()
  connectionName: string;

  @ApiProperty()
  @IsString()
  defaultDatabaseName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateDatabaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['active', 'disabled', 'migrating'] })
  @IsOptional()
  @IsIn(['active', 'disabled', 'migrating'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultDatabaseName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
