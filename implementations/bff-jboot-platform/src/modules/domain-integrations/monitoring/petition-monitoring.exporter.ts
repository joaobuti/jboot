import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PetitionMonitoringService } from '../../kanban/actions/petition-monitoring.service';
import { CardsRepository } from '../../kanban/cards/cards.repository';
import { MutateContext } from '../../kanban/kanban.types';
import { ProcessMonitoringService } from '../../process-monitoring/process-monitoring.service';
import { ProcessMonitorDestinationRef, ProcessMonitoringCaller, ProcessMonitoringProduct } from '../../process-monitoring/process-monitoring.types';
import { DomainApplicationContextService } from '../application-context.service';
import { DomainIntegrationRequestContext } from '../domain-integration.types';

export interface PetitionMonitoringSent {
  petitionId: string;
  boardId: string;
  cardId: string;
  cardUrl: string;
  created: boolean;
}

/**
 * Acao Monitorar (docs/product/flow-card-actions-sprints.md, Sprint 2): para cada peticao escolhida,
 * o Kanban cria o card no board de monitoramento e este exportador liga o acompanhamento DataJud diario
 * na capacidade `monitoramento-processual`, com destino no card (ADR 021). Sem Juridico desde a Sprint 3
 * de docs/product/process-monitoring-sprints.md: so a capacidade contratada pelo cliente.
 */
@Injectable()
export class PetitionMonitoringExporter {
  private readonly logger = new Logger(PetitionMonitoringExporter.name);

  constructor(
    private readonly contexts: DomainApplicationContextService,
    private readonly cards: CardsRepository,
    private readonly petitions: PetitionMonitoringService,
    private readonly monitors: ProcessMonitoringService
  ) {}

  async options(caller: DomainIntegrationRequestContext, cardId: string) {
    const flow = await this.contexts.requireCaller(caller, 'flow', ['flow:read', 'flow:write']);
    const boardId = await this.boardOf(flow.databaseRef, caller.clientId, cardId);
    const monitoringEnabled = await this.monitors.isEnabled(this.flowCaller(caller));
    return { ...(await this.petitions.options(flow, boardId, cardId)), monitoringEnabled };
  }

  async send(
    caller: DomainIntegrationRequestContext,
    cardId: string,
    petitionIds: string[],
    targetBoardId: string,
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ): Promise<{ sent: PetitionMonitoringSent[] }> {
    const flow = await this.contexts.requireCaller(caller, 'flow', ['flow:read', 'flow:write']);
    const who = this.flowCaller(caller);
    // Capacidade contratada pelo cliente (ADR 021); o Juridico nao entra mais.
    if (!(await this.monitors.isEnabled(who))) {
      throw new ForbiddenException({ code: 'process_monitoring_not_contracted', message: 'Monitoramento processual nao contratado para este cliente.' });
    }
    const boardId = await this.boardOf(flow.databaseRef, caller.clientId, cardId);
    const mutate: MutateContext = { ...flow, ...requestInfo };
    // Peticoes ainda nao enviadas, com o numero: a checagem de unicidade roda antes de criar o card.
    const pending = new Map(
      (await this.petitions.options(flow, boardId, cardId)).petitions.map((petition) => [petition.id, petition.processNumber])
    );
    const sent: PetitionMonitoringSent[] = [];
    for (const petitionId of petitionIds) {
      const operationKey = `flow-petition:${petitionId}:monitoring`;
      let stage = 'check_process';
      try {
        // Processo ja acompanhado (outro card ou Juridico): recusa antes de criar o card. O numero do
        // processo ja e unico entre os cards do cliente pelo registro do protocolo no Kanban.
        const pendingNumber = pending.get(petitionId);
        if (pendingNumber) {
          const live = await this.monitors.findLiveByProcess(who, pendingNumber);
          if (live) throw this.numberInUse(live);
        }

        stage = 'create_card';
        const card = await this.petitions.createMonitoringCard(flow, mutate, boardId, cardId, petitionId, targetBoardId);

        stage = 'start_monitor';
        // Reenvio de peticao ja enviada (retomada) reaproveita o acompanhamento do proprio card.
        await this.monitors.ensureActive(who, {
          processNumber: card.processNumber,
          tribunal: card.tribunal,
          cadence: 'daily',
          destinationRef: { databaseRef: flow.databaseRef, boardId: card.boardId, cardId: card.cardId }
        });
        this.log(operationKey, 'completed', 'complete');
        sent.push({
          petitionId,
          boardId: card.boardId,
          cardId: card.cardId,
          cardUrl: `/flow/boards/${card.boardId}?card=${card.cardId}`,
          created: card.created
        });
      } catch (error) {
        this.log(operationKey, 'failed', stage);
        throw error;
      }
    }
    return { sent };
  }

  private numberInUse(live: { destinationProduct: ProcessMonitoringProduct; destinationRef: ProcessMonitorDestinationRef | null }): ConflictException {
    const ref = live.destinationRef;
    if (ref && 'cardId' in ref) {
      return new ConflictException({
        code: 'process_number_in_use',
        message: 'Ja existe um card acompanhando este numero do processo.',
        cardId: ref.cardId,
        cardUrl: `/flow/boards/${ref.boardId}?card=${ref.cardId}`
      });
    }
    return new ConflictException({
      code: 'process_monitor_in_use',
      message: 'Este processo ja e acompanhado no Juridico.',
      destinationProduct: live.destinationProduct
    });
  }

  private flowCaller(caller: DomainIntegrationRequestContext): ProcessMonitoringCaller {
    return { clientId: caller.clientId, identityId: caller.identityId, product: 'flow' };
  }

  private async boardOf(flowDatabaseRef: string, clientId: string, cardId: string): Promise<string> {
    const card = await this.cards.findByIdForClient(flowDatabaseRef, clientId, cardId);
    if (!card) throw new NotFoundException('Card not found');
    return card.boardId;
  }

  private log(operationKey: string, status: 'completed' | 'failed', stage: string): void {
    const message = JSON.stringify({ event: 'domain_integration', operationKey, status, stage });
    if (status === 'failed') this.logger.error(message);
    else this.logger.log(message);
  }
}
