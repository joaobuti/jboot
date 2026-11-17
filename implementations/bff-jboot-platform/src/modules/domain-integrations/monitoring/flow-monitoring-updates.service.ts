import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../../config/app-config.service';
import { CardVisibilityService } from '../../kanban/shared/card-visibility.service';
import { ProcessMonitoringCapabilityService } from '../../process-monitoring/process-monitoring-capability.service';
import { todayInBrasilia } from '../../process-monitoring/process-publications';
import { DomainApplicationContextService } from '../application-context.service';
import { DomainIntegrationRequestContext } from '../domain-integration.types';

export type MonitoringUpdateSource = 'datajud' | 'djen';

export interface MonitoringUpdateItem {
  cardId: string;
  boardId: string;
  /** Titulo do card = nome do cliente (ver docs/product/process-monitoring-sprints.md, S11). */
  title: string;
  processNumber: string;
  updatedAt: string;
}

export interface MonitoringUpdatesToday {
  /** Dia de Brasilia (AAAA-MM-DD). */
  date: string;
  /** Processos atualizados hoje que o usuario ve, somando so as capacidades contratadas. */
  total: number;
  datajud: { enabled: boolean; items: MonitoringUpdateItem[] };
  djen: { enabled: boolean; items: MonitoringUpdateItem[] };
}

const MAX_ITEMS = 200;
const TTL_SECONDS = 2 * 24 * 3600;

/** Chave do dia por cliente e fonte; um campo por card (processo atualizado conta uma vez no dia). */
export function monitoringUpdatesKey(clientId: string, date: string, source: MonitoringUpdateSource): string {
  return `flow:monitoring-updates:${clientId}:${date}:${source}`;
}

/**
 * Sino do Flow (docs/product/flow-offices-sprints.md, S6): processos atualizados no dia pelo DataJud e
 * pelo DJEN, em cache (Valkey/Redis) que vira no dia seguinte. Cada fonte so aparece com a capacidade
 * contratada; cada item so aparece se o usuario ve o card. Cache indisponivel nunca quebra a entrega.
 */
@Injectable()
export class FlowMonitoringUpdatesService implements OnModuleDestroy {
  private readonly logger = new Logger(FlowMonitoringUpdatesService.name);
  private client: Redis | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly contexts: DomainApplicationContextService,
    private readonly visibility: CardVisibilityService,
    private readonly capability: ProcessMonitoringCapabilityService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }

  async record(input: { clientId: string; source: MonitoringUpdateSource; cardId: string; boardId: string; processNumber: string }, now = Date.now()): Promise<void> {
    try {
      const key = monitoringUpdatesKey(input.clientId, todayInBrasilia(now), input.source);
      const value = JSON.stringify({ boardId: input.boardId, processNumber: input.processNumber, updatedAt: new Date(now).toISOString() });
      await this.redis().multi().hset(key, input.cardId, value).expire(key, TTL_SECONDS).exec();
    } catch (error) {
      this.logger.warn(`monitoring update not cached: ${(error as Error).message}`);
    }
  }

  async today(caller: DomainIntegrationRequestContext, now = Date.now()): Promise<MonitoringUpdatesToday> {
    const flow = await this.contexts.requireCaller(caller, 'flow', ['flow:read']);
    const date = todayInBrasilia(now);
    const [datajudEnabled, djenEnabled] = await Promise.all([
      this.capability.isEnabled(caller.clientId),
      this.capability.publicationsEnabled(caller.clientId)
    ]);
    const load = async (source: MonitoringUpdateSource, enabled: boolean): Promise<MonitoringUpdateItem[]> => {
      if (!enabled) return [];
      let raw: Record<string, string> = {};
      try {
        raw = await this.redis().hgetall(monitoringUpdatesKey(caller.clientId, date, source));
      } catch (error) {
        this.logger.warn(`monitoring updates unavailable: ${(error as Error).message}`);
        return [];
      }
      const entries = Object.entries(raw)
        .map(([cardId, json]) => ({ cardId, ...(JSON.parse(json) as { boardId: string; processNumber: string; updatedAt: string }) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_ITEMS);
      const visible = await Promise.all(
        entries.map(async (entry) => {
          try {
            const card = await this.visibility.requireVisibleCard(flow, entry.boardId, entry.cardId);
            return { ...entry, title: card.title };
          } catch {
            return null; // card que o usuario nao ve (ou apagado) fica fora
          }
        })
      );
      return visible.filter((item): item is MonitoringUpdateItem => item !== null);
    };
    const [datajud, djen] = await Promise.all([load('datajud', datajudEnabled), load('djen', djenEnabled)]);
    return {
      date,
      total: datajud.length + djen.length,
      datajud: { enabled: datajudEnabled, items: datajud },
      djen: { enabled: djenEnabled, items: djen }
    };
  }

  private redis(): Redis {
    if (!this.client) {
      this.client = new Redis(this.config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
      this.client.on('error', (error) => this.logger.warn(`redis: ${error.message}`));
    }
    return this.client;
  }
}
