import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class UpdatePjeMonitoringConfigDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'numeroOab deve conter apenas digitos' })
  numeroOab?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/, { message: 'ufOab deve ser a sigla da UF' })
  ufOab?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  nomeAdvogado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  nomeParte?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9]{2,20}$/, { each: true })
  siglasTribunal?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  lookbackDays?: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class StartPjeSyncDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  lookbackDays?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{15,25}$/, { message: 'numeroProcesso deve conter apenas digitos' })
  numeroProcesso?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,20}$/)
  siglaTribunal?: string;
}

export class ListPjeComunicacoesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,20}$/)
  siglaTribunal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tipoComunicacao?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{15,25}$/)
  numeroProcesso?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dataInicio deve estar no formato yyyy-mm-dd' })
  dataInicio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dataFim deve estar no formato yyyy-mm-dd' })
  dataFim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}
