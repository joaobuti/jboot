import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JuridicoWorkerAuthGuard } from '../shared/juridico-worker-auth.guard';
import { DataJudRepository } from './datajud.repository';

class ManualSnapshotPurgeDto {
  @IsString() @MaxLength(128) databaseRef!: string;
}

/**
 * Retencao das consultas manuais do Juridico (snapshot `manual_query`, 180 dias). A execucao dos
 * acompanhamentos saiu para `internal/process-monitoring` (ADR 021, Sprint 2); esta rota so purga o
 * que continua sendo do Juridico.
 */
@UseGuards(JuridicoWorkerAuthGuard)
@Controller('internal/juridico/datajud/acompanhamentos')
export class DataJudMonitorInternalController {
  constructor(private readonly dataJud: DataJudRepository) {}

  @Post('purge')
  async purge(@Body() body: ManualSnapshotPurgeDto) {
    return { purged: 0, purgedManualSnapshots: await this.dataJud.purgeExpiredManualSnapshots(body.databaseRef) };
  }
}
