import { IsArray, IsOptional, IsString, ArrayNotEmpty, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CpfEntryDto {
  @IsString()
  cpf!: string;

  @IsString()
  nome!: string;
}

export class ImportCpfsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CpfEntryDto)
  entries!: CpfEntryDto[];

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  uf!: string;

  @IsOptional()
  @IsString()
  filename?: string;
}

export interface ImportResultDto {
  imported: number;
  skipped: number;
  importId: string;
  uf: string;
}

export type ConsultationStatus = 'pending' | 'done' | 'error';

export interface ConsultationDto {
  portalSlug: string;
  portalName: string;
  status: ConsultationStatus;
  lastConsultedAt: string | null;
  errorMessage: string | null;
}

export interface CaptacaoCpfDto {
  id: string;
  cpf: string;
  nome: string | null;
  createdAt: string;
  consultations: ConsultationDto[];
}

export interface CaptacaoPageDto {
  data: CaptacaoCpfDto[];
  meta: { limit: number; offset: number; total: number };
}

export class SetSchedulingConfigDto {
  @IsString()
  interval!: 'daily' | 'weekly' | 'biweekly' | 'monthly';
}

export interface SchedulingConfigDto {
  portalSlug: string;
  interval: string | null;
  status: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
}
