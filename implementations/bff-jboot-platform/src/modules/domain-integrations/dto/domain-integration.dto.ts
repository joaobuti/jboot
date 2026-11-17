import { DjenCadenceDays } from '../../process-monitoring/process-monitoring.types';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsUUID } from 'class-validator';
import { DATAJUD_MONITOR_CADENCES, DataJudMonitorCadence } from '../../juridico/datajud/dto/datajud-monitor.dto';

export class ExportJuridicoPjeToFlowDto {
  @ApiProperty()
  @IsUUID()
  boardId!: string;

  /** Escritorio do card no Flow: obrigatorio (regra de escritorio da Sprint 3.5). */
  @ApiProperty()
  @IsUUID()
  officeId!: string;
}

export class ExportJuridicoDataJudToFlowDto {
  @ApiProperty()
  @IsUUID()
  boardId!: string;

  /** Escritorio do card no Flow: obrigatorio (regra de escritorio da Sprint 3.5). */
  @ApiProperty()
  @IsUUID()
  officeId!: string;
}

export class SetCardMonitoringDto {
  @ApiProperty()
  @IsBoolean()
  monitor!: boolean;
}

export class SetCardMonitoringCadenceDto {
  @ApiProperty({ enum: DATAJUD_MONITOR_CADENCES })
  @IsIn(DATAJUD_MONITOR_CADENCES)
  cadence!: DataJudMonitorCadence;
}

/** Olho do DJEN no card (ADR 022). */
export class SetCardDjenDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

/** Frequencia do DJEN em dias uteis (ADR 022): 1, 3 ou 7. */
export class SetCardDjenCadenceDto {
  @ApiProperty({ enum: [1, 3, 7] })
  @IsIn([1, 3, 7])
  days!: DjenCadenceDays;
}

export interface FlowBoardOptionDto {
  id: string;
  name: string;
  defaultColumnId: string;
}

export interface FlowOfficeOptionDto {
  id: string;
  name: string;
}

export interface FlowBoardsResponseDto {
  flowEnabled: boolean;
  boards: FlowBoardOptionDto[];
  /** Escritorios em que o usuario pode criar card: todos os ativos para flow:admin, os proprios para os demais. */
  offices: FlowOfficeOptionDto[];
}

export interface ExportToFlowResponseDto {
  boardId: string;
  cardId: string;
  cardUrl: string;
  created: boolean;
}

/** Acao Monitorar (Sprint 2 de flow-card-actions): peticoes do card e board de monitoramento de destino. */
export class SendPetitionsToMonitoringDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  petitionIds!: string[];

  @ApiProperty()
  @IsUUID()
  targetBoardId!: string;
}
