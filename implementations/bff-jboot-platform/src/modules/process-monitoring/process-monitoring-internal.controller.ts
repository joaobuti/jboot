import { BadRequestException, Body, Controller, Headers, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsISO8601, IsString, IsUUID, MaxLength } from 'class-validator';
import { JuridicoWorkerAuthGuard } from '../shared/worker-auth/juridico-worker-auth.guard';
import { ProcessMonitoringService } from './process-monitoring.service';

class ProcessMonitorRunDto {
  @IsUUID() clientId!: string;
  @IsString() @MaxLength(128) workflowRunId!: string;
  @IsISO8601() scheduledAt!: string;
}

class ProcessMonitorPlanDto {
  @IsUUID() clientId!: string;
}

/**
 * Rota interna S2S do worker Temporal (ADR 021). JWT de servico com `aud=svc:platform-api` e caller
 * `juridico-worker`; o banco e unico, entao o worker nao envia `databaseRef`.
 */
@UseGuards(JuridicoWorkerAuthGuard)
@Controller('internal/process-monitoring/monitors')
export class ProcessMonitoringInternalController {
  constructor(private readonly service: ProcessMonitoringService) {}

  @Post('purge')
  purge() {
    return this.service.purge();
  }

  /** Ciclo diario (ADR 022): quais fontes venceram. */
  @Post(':id/plan')
  plan(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ProcessMonitorPlanDto) {
    return this.service.plan(body.clientId, id);
  }

  /** Execucao do DJEN (fila `process-publications`). */
  @Post(':id/publication-runs')
  runPublications(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ProcessMonitorRunDto
  ) {
    if (!idempotencyKey || idempotencyKey.length > 128) throw new BadRequestException('Missing idempotency key');
    return this.service.runPublications(body.clientId, id, idempotencyKey, body.workflowRunId);
  }

  @Post(':id/runs')
  run(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ProcessMonitorRunDto
  ) {
    if (!idempotencyKey || idempotencyKey.length > 128) throw new BadRequestException('Missing idempotency key');
    return this.service.run(body.clientId, id, idempotencyKey, body.workflowRunId);
  }
}
