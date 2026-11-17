import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export type {
  CodeNameDto,
  InternalProcessResponseDto,
  MovementComplementDto,
  MovementDto,
  ProblemDto,
  ProcessDto,
  TribunalDto,
  TribunalListDto,
} from '../../../shared/juridico-data/juridico-data.types';
import type { InternalProcessResponseDto } from '../../../shared/juridico-data/juridico-data.types';

export class QueryDataJudProcessDto {
  @IsString()
  @MinLength(20)
  @MaxLength(25)
  numeroProcesso!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]{2,16}$/)
  tribunal?: string | null;
}

export class ListProcessesByOabDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'numeroOab deve conter apenas digitos' })
  numeroOab!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'ufOab deve ser a sigla da UF' })
  ufOab!: string;

  @ApiProperty()
  @IsISO8601({ strict: true })
  dataInicio!: string;

  @ApiProperty()
  @IsISO8601({ strict: true })
  dataFim!: string;
}

export interface ProcessByOabDto {
  numeroProcesso: string;
  numeroProcessoMask: string;
  tribunal: string | null;
  orgao: string | null;
  classe: string | null;
  ultimaPublicacaoEm: string | null;
  /** Quantas publicacoes do periodo apontam para este processo. */
  publicacoes: number;
  /**
   * Consulta ja gravada para este processo. Permite reabrir os dados sem
   * consultar o provedor de novo — o snapshot vive 180 dias.
   */
  snapshotId: string | null;
  consultadoEm: string | null;
  /** Ja existe card no Flow para este processo neste cliente. */
  exportado: boolean;
  /** Link do card mais recente, quando exportado. */
  cardUrl: string | null;
}

export interface ProcessesByOabResponseDto {
  items: ProcessByOabDto[];
  total: number;
  publicacoesAnalisadas: number;
}

export interface ProcessQueryResponseDto extends InternalProcessResponseDto {
  lagNotice: string;
  /** Snapshot persistido da consulta; e o id aceito pelo export para o Flow. */
  snapshotId: string | null;
}

