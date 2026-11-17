import { Injectable, OnModuleInit } from '@nestjs/common';
import { ProcessMonitoringDeliveryRegistry } from '../../process-monitoring/process-monitoring-delivery.registry';
import { ProcessMonitoringService } from '../../process-monitoring/process-monitoring.service';
import { ProcessMonitorView, ProcessMonitoringCaller, ProcessMovementView } from '../../process-monitoring/process-monitoring.types';
import { JuridicoRequestContext } from '../shared/juridico.types';
import { CreateDataJudMonitorDto, DataJudMonitorCadence, UpdateDataJudMonitorDto } from './dto/datajud-monitor.dto';

/** Formato da tela Acompanhamentos, mantido desde a Sprint 2 do DataJud. */
export interface DataJudMonitorRow {
  id: string;
  tribunal: string | null;
  cadence: DataJudMonitorCadence;
  state: 'active' | 'paused' | 'deleted';
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  pausedAt: string | null;
  deletedAt: string | null;
  purgeAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tela Acompanhamentos do Juridico sobre a capacidade `monitoramento-processual` (ADR 021, Sprint 2):
 * destino `juridico`, referencia o banco do Juridico do cliente. As rotas HTTP do Juridico continuam as
 * mesmas; quem guarda o estado, executa e retem e o modulo `process-monitoring`.
 */
@Injectable()
export class DataJudMonitorService implements OnModuleInit {
  constructor(
    private readonly monitoring: ProcessMonitoringService,
    private readonly delivery: ProcessMonitoringDeliveryRegistry
  ) {}

  onModuleInit(): void {
    // As movimentacoes ja ficam gravadas na capacidade e a tela le de la: entregar ao Juridico nao
    // tem efeito extra. O registro evita o aviso de destino sem adaptador.
    this.delivery.register('juridico', { deliver: async () => undefined });
  }

  async create(ctx: JuridicoRequestContext, dto: CreateDataJudMonitorDto): Promise<DataJudMonitorRow> {
    const monitor = await this.monitoring.create(this.caller(ctx), {
      processNumber: dto.processNumber,
      tribunal: dto.tribunal ?? null,
      cadence: dto.cadence,
      destinationRef: { databaseRef: ctx.databaseRef }
    });
    return this.row(monitor);
  }

  async get(ctx: JuridicoRequestContext, id: string): Promise<DataJudMonitorRow> {
    return this.row(await this.monitoring.get(this.caller(ctx), id));
  }

  async list(ctx: JuridicoRequestContext): Promise<DataJudMonitorRow[]> {
    return (await this.monitoring.list(this.caller(ctx))).map((monitor) => this.row(monitor));
  }

  movements(ctx: JuridicoRequestContext, id: string): Promise<ProcessMovementView[]> {
    return this.monitoring.movements(this.caller(ctx), id);
  }

  async update(ctx: JuridicoRequestContext, id: string, dto: UpdateDataJudMonitorDto): Promise<DataJudMonitorRow> {
    const caller = this.caller(ctx);
    let monitor = dto.cadence ? await this.monitoring.setCadence(caller, id, dto.cadence) : await this.monitoring.get(caller, id);
    if (dto.state === 'paused') monitor = await this.monitoring.pause(caller, id);
    if (dto.state === 'active') monitor = await this.monitoring.resume(caller, id);
    return this.row(monitor);
  }

  remove(ctx: JuridicoRequestContext, id: string): Promise<void> {
    return this.monitoring.remove(this.caller(ctx), id);
  }

  private caller(ctx: JuridicoRequestContext): ProcessMonitoringCaller {
    return { clientId: ctx.clientId, identityId: ctx.identityId, product: 'juridico' };
  }

  private row(monitor: ProcessMonitorView): DataJudMonitorRow {
    return {
      id: monitor.id,
      tribunal: monitor.tribunal,
      cadence: monitor.cadence,
      state: monitor.state,
      lastCheckedAt: monitor.lastCheckedAt,
      nextCheckAt: monitor.nextCheckAt,
      pausedAt: monitor.pausedAt,
      deletedAt: null,
      purgeAfter: null,
      createdAt: monitor.createdAt,
      updatedAt: monitor.updatedAt
    };
  }
}
