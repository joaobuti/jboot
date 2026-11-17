import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JuridicoRequestContext } from '../shared/juridico.types';
import {
  ListPjeComunicacoesDto,
  StartPjeSyncDto,
  UpdatePjeMonitoringConfigDto,
} from './dto/pje.dto';
import { PjeDataClientService } from './pje-data-client.service';
import { PjeComunicacaoRow, PjeProviderComunicacao, PjeRepository, PjeSyncJobRow } from './pje.repository';

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_PAGE_SIZE = 20;

export interface PjeMonitoringConfigDto {
  configured: boolean;
  numeroOab: string | null;
  ufOab: string | null;
  nomeAdvogado: string | null;
  nomeParte: string | null;
  siglasTribunal: string[];
  lookbackDays: number;
  status: 'active' | 'inactive';
  updatedAt: string | null;
}

export interface PjeSyncJobDto {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerSource: string;
  dataInicio: string | null;
  dataFim: string | null;
  paginasLidas: number;
  comunicacoesRecebidas: number;
  comunicacoesNovas: number;
  comunicacoesDuplicadas: number;
  rateLimitWaits: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  runningInProcess: boolean;
}

@Injectable()
export class PjeService {
  private readonly syncTasks = new Set<string>();

  constructor(
    private readonly repository: PjeRepository,
    private readonly data: PjeDataClientService,
  ) {}

  async getConfig(ctx: JuridicoRequestContext): Promise<PjeMonitoringConfigDto> {
    const row = await this.repository.getConfig(ctx.clientId, ctx.databaseRef);
    if (!row) {
      return {
        configured: false,
        numeroOab: null,
        ufOab: null,
        nomeAdvogado: null,
        nomeParte: null,
        siglasTribunal: [],
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
        status: 'active',
        updatedAt: null,
      };
    }

    return {
      configured: true,
      numeroOab: row.numeroOab,
      ufOab: row.ufOab,
      nomeAdvogado: row.nomeAdvogado,
      nomeParte: row.nomeParte,
      siglasTribunal: row.siglasTribunal ?? [],
      lookbackDays: row.lookbackDays,
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  async updateConfig(
    ctx: JuridicoRequestContext,
    dto: UpdatePjeMonitoringConfigDto,
  ): Promise<PjeMonitoringConfigDto> {
    const numeroOab = this.clean(dto.numeroOab);
    const ufOab = this.clean(dto.ufOab)?.toUpperCase() ?? null;
    const nomeAdvogado = this.clean(dto.nomeAdvogado);
    const nomeParte = this.clean(dto.nomeParte);
    const siglasTribunal = (dto.siglasTribunal ?? [])
      .map((sigla) => sigla.trim().toUpperCase())
      .filter(Boolean);

    if (numeroOab && !ufOab) {
      throw new BadRequestException('Informe a UF da OAB junto com o numero');
    }
    if (ufOab && !numeroOab) {
      throw new BadRequestException('Informe o numero da OAB junto com a UF');
    }

    // A API DJEN recusa consultas sem ao menos um campo discriminante.
    const temFiltro = Boolean(numeroOab && ufOab) || Boolean(nomeAdvogado) || Boolean(nomeParte) || siglasTribunal.length > 0;
    if (!temFiltro) {
      throw new BadRequestException(
        'Configure ao menos OAB + UF, nome do advogado, nome da parte ou sigla de tribunal',
      );
    }

    await this.repository.upsertConfig(ctx.clientId, ctx.databaseRef, {
      numeroOab,
      ufOab,
      nomeAdvogado,
      nomeParte,
      siglasTribunal,
      lookbackDays: dto.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
      status: dto.status ?? 'active',
    });

    return this.getConfig(ctx);
  }

  async listComunicacoes(
    ctx: JuridicoRequestContext,
    query: ListPjeComunicacoesDto,
  ): Promise<{
    items: PjeComunicacaoRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { items, total } = await this.repository.listComunicacoes(ctx.clientId, ctx.databaseRef, {
      page,
      pageSize,
      siglaTribunal: query.siglaTribunal,
      tipoComunicacao: query.tipoComunicacao,
      numeroProcesso: query.numeroProcesso,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      busca: query.busca,
    });

    return { items, total, page, pageSize };
  }

  async getComunicacao(ctx: JuridicoRequestContext, id: string): Promise<PjeComunicacaoRow> {
    const row = await this.repository.getComunicacao(ctx.clientId, ctx.databaseRef, id);
    if (!row) {
      throw new NotFoundException('Comunicacao nao encontrada');
    }
    return row;
  }

  getResumo(ctx: JuridicoRequestContext): Promise<{ total: number; ultimaDisponibilizacao: string | null }> {
    return this.repository.getResumo(ctx.clientId, ctx.databaseRef);
  }

  async startSync(ctx: JuridicoRequestContext, dto: StartPjeSyncDto): Promise<PjeSyncJobDto> {
    const config = await this.repository.getConfig(ctx.clientId, ctx.databaseRef);
    if (!config) {
      throw new BadRequestException('Configure o monitoramento PJe antes de sincronizar');
    }
    if (config.status !== 'active') {
      throw new BadRequestException('Monitoramento PJe esta inativo');
    }

    const filtro = {
      numeroOab: config.numeroOab,
      ufOab: config.ufOab,
      nomeAdvogado: config.nomeAdvogado,
      nomeParte: config.nomeParte,
      numeroProcesso: dto.numeroProcesso ?? null,
      siglaTribunal: (dto.siglaTribunal ?? config.siglasTribunal?.[0] ?? null)?.toUpperCase() ?? null,
    };
    if (!this.hasFilter(filtro)) throw new BadRequestException('Filtro PJe insuficiente');
    const lookback = dto.lookbackDays ?? config.lookbackDays;
    const dataFim = new Date();
    const dataInicio = new Date(dataFim);
    dataInicio.setUTCDate(dataInicio.getUTCDate() - lookback + 1);
    const job = await this.repository.createSyncJob(ctx.clientId, ctx.databaseRef, {
      filtro, dataInicio: dataInicio.toISOString().slice(0, 10), dataFim: dataFim.toISOString().slice(0, 10),
    });
    this.syncTasks.add(job.id);
    void this.runSync(ctx, job).finally(() => this.syncTasks.delete(job.id));
    return this.toJobDto(job);
  }

  async getActiveSync(ctx: JuridicoRequestContext): Promise<PjeSyncJobDto | { status: 'none' }> {
    const job = await this.repository.getActiveOrLastSyncJob(ctx.clientId, ctx.databaseRef);
    return job ? this.toJobDto(job) : { status: 'none' };
  }

  async getSync(ctx: JuridicoRequestContext, jobId: string): Promise<PjeSyncJobDto> {
    const job = await this.repository.getSyncJob(ctx.clientId, ctx.databaseRef, jobId);
    if (!job) throw new NotFoundException('Sync job nao encontrado');
    return this.toJobDto(job);
  }

  async cancelSync(ctx: JuridicoRequestContext, jobId: string): Promise<{ jobId: string; status: string }> {
    const job = await this.repository.getSyncJob(ctx.clientId, ctx.databaseRef, jobId);
    if (!job) throw new NotFoundException('Sync job nao encontrado');
    if (job.status === 'queued' || job.status === 'running') await this.repository.finishSyncJob(ctx.databaseRef, jobId, 'cancelled', 'Cancelado manualmente pelo usuario');
    return { jobId, status: job.status === 'queued' || job.status === 'running' ? 'cancelled' : job.status };
  }

  async listTribunais(): Promise<unknown[]> {
    return (await this.data.tribunais()).items;
  }

  private toJobDto(response: PjeSyncJobRow): PjeSyncJobDto {
    return {
      jobId: response.id,
      status: response.status,
      triggerSource: response.triggerSource,
      dataInicio: response.dataInicio, dataFim: response.dataFim,
      paginasLidas: response.paginasLidas, comunicacoesRecebidas: response.comunicacoesRecebidas,
      comunicacoesNovas: response.comunicacoesNovas, comunicacoesDuplicadas: response.comunicacoesDuplicadas,
      rateLimitWaits: response.rateLimitWaits, lastError: response.lastError,
      startedAt: response.startedAt, finishedAt: response.finishedAt, createdAt: response.createdAt, updatedAt: response.updatedAt,
      runningInProcess: this.syncTasks.has(response.id),
    };
  }

  private async runSync(ctx: JuridicoRequestContext, job: PjeSyncJobRow): Promise<void> {
    try {
      await this.repository.markSyncRunning(ctx.databaseRef, job.id);
      const filtro = job.filtro as Record<string, string | null>;
      let pagina = 1;
      let recebidas = 0;
      let novas = 0;
      let duplicadas = 0;
      while (pagina <= 50) {
        const current = await this.repository.getSyncJob(ctx.clientId, ctx.databaseRef, job.id);
        if (!current || current.status === 'cancelled') return;
        const query = new URLSearchParams({ pagina: String(pagina), itensPorPagina: '100', dataDisponibilizacaoInicio: job.dataInicio ?? '', dataDisponibilizacaoFim: job.dataFim ?? '' });
        for (const [key, value] of Object.entries(filtro)) if (value) query.set(key, value);
        const page = await this.data.comunicacoes(query);
        const items = page.items.map((item) => this.toProviderComunicacao(item));
        const stored = await this.repository.upsertComunicacoes(ctx.clientId, ctx.databaseRef, job.id, items);
        recebidas += items.length;
        novas += stored.novas;
        duplicadas += stored.duplicadas;
        await this.repository.updateSyncProgress(ctx.databaseRef, job.id, { paginas: pagina, recebidas, novas, duplicadas });
        if (items.length === 0 || recebidas >= page.count) break;
        pagina += 1;
      }
      await this.repository.finishSyncJob(ctx.databaseRef, job.id, 'completed');
    } catch {
      await this.repository.finishSyncJob(ctx.databaseRef, job.id, 'failed', 'Falha na consulta DJEN');
    }
  }

  private toProviderComunicacao(item: Record<string, unknown>): PjeProviderComunicacao {
    const value = <T>(key: string): T | null => item[key] as T ?? null;
    return {
      hash: String(item.hash), comunicacaoId: value<number>('comunicacaoId'), numeroComunicacao: value<number>('numeroComunicacao'),
      numeroProcesso: value<string>('numeroProcesso'), numeroProcessoMask: value<string>('numeroProcessoMask'), siglaTribunal: value<string>('siglaTribunal'), nomeOrgao: value<string>('nomeOrgao'),
      tipoComunicacao: value<string>('tipoComunicacao'), tipoDocumento: value<string>('tipoDocumento'), nomeClasse: value<string>('nomeClasse'), meio: value<string>('meio'), link: value<string>('link'), texto: value<string>('texto'),
      dataDisponibilizacao: value<string>('dataDisponibilizacao'), destinatarios: value<unknown[]>('destinatarios') ?? [], advogados: value<unknown[]>('advogados') ?? [],
    };
  }

  private hasFilter(filter: Record<string, string | null>): boolean {
    return Boolean(filter.numeroOab && filter.ufOab) || Boolean(filter.nomeAdvogado || filter.nomeParte || filter.numeroProcesso || filter.siglaTribunal);
  }

  private clean(value?: string): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

}
