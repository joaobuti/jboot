import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

/**
 * Linha lida da planilha no navegador (docs/product/flow-process-import-sprints.md). Tudo texto
 * livre: a validacao de CPF, CNJ e tribunal e do servico, linha a linha, para a conferencia mostrar
 * o motivo de cada recusa em vez de rejeitar a planilha inteira.
 */
export class ProcessImportRowDto {
  @ApiProperty() @IsInt() @Min(1) line!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) name?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) cpf?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) processNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) state?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) situation?: string | null;
}

export class ProcessImportRequestDto {
  @ApiProperty() @IsUUID() boardId!: string;
  @ApiProperty() @IsUUID() officeId!: string;

  @ApiProperty({ type: [ProcessImportRowDto], minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ProcessImportRowDto)
  rows!: ProcessImportRowDto[];
}
