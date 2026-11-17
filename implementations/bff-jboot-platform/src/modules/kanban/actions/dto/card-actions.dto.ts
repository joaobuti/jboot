import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

/** Configuracao de uma acao que a exige (`config` no catalogo). `routine_agent`: agente de rotina. */
export class ColumnActionConfigDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  actionId!: string;

  @ApiProperty({ description: 'Agente de rotina do Claude de quem configura (vira a conta executora)' })
  @IsUUID()
  agentId!: string;
}

export class ReplaceColumnActionsDto {
  @ApiProperty({ type: [String], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  actionIds!: string[];

  @ApiPropertyOptional({ type: [ColumnActionConfigDto], maxItems: 50, description: 'Obrigatorio para acoes com config no catalogo' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ColumnActionConfigDto)
  configs?: ColumnActionConfigDto[];
}
