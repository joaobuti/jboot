import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDatabaseRefDto {
  @ApiProperty()
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ enum: ['shared_db', 'schema_per_client', 'dedicated_db'] })
  @IsIn(['shared_db', 'schema_per_client', 'dedicated_db'])
  strategy: string;

  @ApiProperty()
  @IsString()
  connectionName: string;

  @ApiProperty()
  @IsString()
  databaseName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schemaName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateDatabaseRefDto {
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
  @IsObject()
  metadata?: Record<string, unknown>;
}
