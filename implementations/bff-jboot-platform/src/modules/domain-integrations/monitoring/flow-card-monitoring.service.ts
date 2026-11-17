import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardAccessService } from '../../kanban/shared/board-access.service';
import { CardsRepository } from '../../kanban/cards/cards.repository';
import { CardVisibilityService } from '../../kanban/shared/card-visibility.service';
import { DataJudRepository } from '../../juridico/datajud/datajud.repository';
import { DataJudMonitorCryptoService } from '../../juridico/shared/datajud-monitor-crypto.service';
import { ProcessMonitoringService } from '../../process-monitoring/process-monitoring.service';
import { DjenCadenceDays, ProcessDetailsView, ProcessMonitorCadence, ProcessMonitorView, ProcessMonitoringCaller, ProcessPublicationView, ProcessTimelineMovement } from '../../process-monitoring/process-monitoring.types';

/** Ultima consulta ao DataJud do acompanhamento do card (Sprint 4 de process-monitoring-sprints.md). */
export interface CardMonitoringLastCheck {
  status: NonNullable<ProcessMonitorView['lastRunStatus']>;
  checkedAt: string;
}
import { DomainApplicationContextService } from '../application-context.service';
import { DomainIntegrationRequestContext, ResolvedApplicationContext } from '../domain-integration.types';
import { DomainIntegrationsRepository } from '../domain-integrations.repository';

export interface CardMonitoringState {
  monitoring: boolean;
  monitorId: string | null;
  hasSource: boolean;
  /** Capacidade `monitoramento-processual` contratada; sem ela o olho do DataJud fica bloqueado na tela. */
  contracted: boolean;
  cadence?: ProcessMonitorCadence;
  lastCheck?: CardMonitoringLastCheck | null;
  nextCheckAt?: string | null;
  /** Publicacoes (DJEN), ADR 022: presente quando o card tem acompanhamento; `available` false = nao contratado. */
  djen?: CardDjenState;
  /** Dados do processo do ultimo retrato do DataJud (Sprint 9). */
  process?: ProcessDetailsView | null;
}

export interface CardDjenState {
  available: boolean;
  enabled: boolean;
  cadenceDays: DjenCadenceDays;
  lastCheck: CardMonitoringLastCheck | null;
  nextCheckOn: string | null;
}

/**
 * Toggle Monitorar do card (Sprint 7 de juridico-datajud-flow-sprints.md) sobre a capacidade
 * `monitoramento-processual` (ADR 021). O acompanhamento e achado pelo card de destino, sem Juridico:
 * vale para cards do Monitorar e da importacao. So o card exportado do DataJud ainda sem acompanhamento
 * precisa do Juridico, porque o numero do processo esta na consulta guardada la. Processo ja acompanhado
 * pela tela do Juridico devolve 409 `process_monitor_in_use` ate existir a transferencia.
 */
@Injectable()
export class FlowCardMonitoringService {
  constructor(
    private readonly contexts: DomainApplicationContextService,
    private readonly repository: DomainIntegrationsRepository,
    private readonly cards: CardsRepository,
    private readonly boardAccess: BoardAccessService,
    private readonly visibility: CardVisibilityService,
    private readonly monitors: ProcessMonitoringService,
    private readonly dataJud: DataJudRepository,
    private readonly crypto: DataJudMonitorCryptoService
  ) {}

  async get(caller: DomainIntegrationRequestContext, cardId: string): Promise<CardMonitoringState> {
    const { flow, card } = await this.authorize(caller, cardId, false);
    const who = this.flowCaller(caller);
    const monitor = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    const contracted = await this.monitors.isEnabled(who);
    if (monitor) {
      const djen = await this.djenState(who, monitor);
      return { ...this.state(monitor, contracted), djen, process: await this.monitors.processDetails(who, monitor.id) };
    }
    const link = await this.juridicoLink(caller, cardId, flow, card.boardId);
    return { monitoring: false, monitorId: null, hasSource: Boolean(link), contracted };
  }

  async set(
    caller: DomainIntegrationRequestContext,
    cardId: string,
    enabled: boolean
  ): Promise<{ monitoring: boolean; monitorId: string | null }> {
    const { flow, card } = await this.authorize(caller, cardId, true);
    const who = this.flowCaller(caller);
    const current = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (current) {
      // Olho do DataJud (ADR 022): liga/desliga so a fonte; as duas desligadas pausam o acompanhamento.
      await this.monitors.setSource(who, current.id, 'datajud', enabled);
      return { monitoring: enabled, monitorId: current.id };
    }
    const link = await this.juridicoLink(caller, cardId, flow, card.boardId);
    if (!link) throw this.missingSource();
    if (!enabled) return { monitoring: false, monitorId: null };
    if (!link.snapshotId) throw this.expired();
    const snapshot = await this.dataJud.getManualSnapshot(caller.clientId, link.juridicoDatabaseRef, link.snapshotId);
    if (!snapshot) throw this.expired();
    const created = await this.monitors.ensureActive(who, {
      processNumber: this.crypto.decrypt(caller.clientId, snapshot.processNumberCiphertext),
      tribunal: snapshot.tribunal,
      cadence: 'daily',
      destinationRef: { databaseRef: flow.databaseRef, boardId: card.boardId, cardId }
    });
    await this.repository.setExportMonitor(link.juridicoDatabaseRef, caller.clientId, cardId, created.id);
    return { monitoring: true, monitorId: created.id };
  }

  /**
   * Movimentacoes do processo do card (Sprint 5 de process-monitoring-sprints.md): o historico que o
   * processo ja tinha mais as detectadas depois. Somente leitura; nao gera evento nem automacao.
   */
  async movements(caller: DomainIntegrationRequestContext, cardId: string): Promise<{ items: ProcessTimelineMovement[] }> {
    const { flow } = await this.authorize(caller, cardId, false);
    const who = this.flowCaller(caller);
    const monitor = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (!monitor) return { items: [] };
    return { items: await this.monitors.processMovements(who, monitor.id) };
  }

  /** Olho do DJEN (ADR 022): exige a capacidade `publicacoes-processuais` para ligar. */
  async setDjen(caller: DomainIntegrationRequestContext, cardId: string, enabled: boolean): Promise<CardDjenState> {
    const { flow } = await this.authorize(caller, cardId, true);
    const who = this.flowCaller(caller);
    const current = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (!current) throw new NotFoundException('Card nao tem acompanhamento');
    const updated = await this.monitors.setSource(who, current.id, 'djen', enabled);
    return this.djenState(who, updated);
  }

  async updateDjenCadence(caller: DomainIntegrationRequestContext, cardId: string, days: DjenCadenceDays): Promise<CardDjenState> {
    const { flow } = await this.authorize(caller, cardId, true);
    const who = this.flowCaller(caller);
    const current = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (!current) throw new NotFoundException('Card nao tem acompanhamento');
    return this.djenState(who, await this.monitors.setDjenCadence(who, current.id, days));
  }

  /** "Ver no DJEN" de uma movimentacao do card (Sprint 9). */
  async lookupPublications(caller: DomainIntegrationRequestContext, cardId: string, movementId: string) {
    const { flow } = await this.authorize(caller, cardId, false);
    const who = this.flowCaller(caller);
    const monitor = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (!monitor) throw new NotFoundException('Card nao tem acompanhamento');
    return this.monitors.lookupPublications(who, monitor.id, movementId);
  }

  /** Publicacoes do DJEN do card (somente leitura). */
  async publications(caller: DomainIntegrationRequestContext, cardId: string): Promise<{ items: ProcessPublicationView[] }> {
    const { flow } = await this.authorize(caller, cardId, false);
    const who = this.flowCaller(caller);
    const monitor = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (!monitor) return { items: [] };
    return { items: await this.monitors.publications(who, monitor.id) };
  }

  async updateCadence(
    caller: DomainIntegrationRequestContext,
    cardId: string,
    cadence: ProcessMonitorCadence
  ): Promise<{ monitoring: true; monitorId: string; cadence: ProcessMonitorCadence }> {
    const { flow } = await this.authorize(caller, cardId, true);
    const who = this.flowCaller(caller);
    const current = await this.monitors.findByDestinationCard(who, flow.databaseRef, cardId);
    if (!current || current.state !== 'active') throw new NotFoundException('Card nao tem monitoramento ativo');
    const updated = await this.monitors.setCadence(who, current.id, cadence);
    return { monitoring: true, monitorId: current.id, cadence: updated.cadence };
  }

  /** Sem a capacidade contratada o DataJud nao e consultado (plano do ciclo diario), entao nao conta como ativo. */
  private state(monitor: ProcessMonitorView, contracted: boolean): CardMonitoringState {
    const lastCheck = monitor.lastRunStatus && monitor.lastCheckedAt ? { status: monitor.lastRunStatus, checkedAt: monitor.lastCheckedAt } : null;
    if (!contracted || monitor.state !== 'active' || !monitor.datajudEnabled) {
      return { monitoring: false, monitorId: monitor.id, hasSource: true, contracted, lastCheck };
    }
    return { monitoring: true, monitorId: monitor.id, hasSource: true, contracted, cadence: monitor.cadence, lastCheck, nextCheckAt: monitor.nextCheckAt };
  }

  private async djenState(who: ProcessMonitoringCaller, monitor: ProcessMonitorView): Promise<CardDjenState> {
    const { publicationsAvailable, djenActive } = await this.monitors.sources(who, monitor);
    return {
      available: publicationsAvailable,
      enabled: djenActive,
      cadenceDays: monitor.djenCadenceDays,
      lastCheck: monitor.djenLastRunStatus && monitor.djenLastCheckedAt ? { status: monitor.djenLastRunStatus, checkedAt: monitor.djenLastCheckedAt } : null,
      nextCheckOn: monitor.djenNextCheckOn
    };
  }

  private async authorize(caller: DomainIntegrationRequestContext, cardId: string, mutate: boolean) {
    const flow = await this.contexts.requireCaller(caller, 'flow', [mutate ? 'flow:write' : 'flow:read']);
    const card = await this.cards.findByIdForClient(flow.databaseRef, caller.clientId, cardId);
    if (!card) throw new NotFoundException('Card not found');
    // findByIdForClient so descobre o quadro; membresia e visibilidade do card
    // (escritorio, CRM de leads) passam pelo ponto unico do Kanban.
    await this.visibility.requireVisibleCard(flow, card.boardId, cardId);
    if (mutate) await this.boardAccess.requireRole(flow, card.boardId, ['board_admin', 'board_member']);
    return { flow, card };
  }

  /** Vinculo do card exportado do DataJud; so existe para quem tambem tem o Juridico. */
  private async juridicoLink(caller: DomainIntegrationRequestContext, cardId: string, flow: ResolvedApplicationContext, boardId: string) {
    const juridico = await this.contexts.requireApplication(caller, 'juridico', ['juridico:read']).catch((error: unknown) => {
      if (error instanceof ForbiddenException) return null;
      throw error;
    });
    if (!juridico) return null;
    const link = await this.repository.findExportByCard(juridico.databaseRef, caller.clientId, cardId);
    if (!link || link.flowDatabaseRef !== flow.databaseRef || link.boardId !== boardId) return null;
    return { ...link, juridicoDatabaseRef: juridico.databaseRef };
  }

  private flowCaller(caller: DomainIntegrationRequestContext): ProcessMonitoringCaller {
    return { clientId: caller.clientId, identityId: caller.identityId, product: 'flow' };
  }

  private missingSource(): NotFoundException {
    return new NotFoundException('Card nao tem origem DataJud exportada por este cliente');
  }

  private expired(): NotFoundException {
    return new NotFoundException('Consulta de origem expirada; refaca a consulta antes de monitorar');
  }
}
