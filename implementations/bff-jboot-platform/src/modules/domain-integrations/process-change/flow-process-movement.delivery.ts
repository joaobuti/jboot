import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ActivitiesService } from '../../kanban/activities/activities.service';
import { EmailAutomationOutboxService } from '../../kanban/automation/email-automation-outbox.service';
import { CardsRepository } from '../../kanban/cards/cards.repository';
import { ProcessMonitoringDeliveryRegistry } from '../../process-monitoring/process-monitoring-delivery.registry';
import { ProcessMovementNotification, ProcessPublicationNotification } from '../../process-monitoring/process-monitoring.types';
import { FlowMonitoringUpdatesService } from '../monitoring/flow-monitoring-updates.service';

/**
 * Destino `flow` da capacidade `monitoramento-processual` (ADR 021): movimentacao nova vira
 * `system_event` no historico do card de destino. Titulo, descricao e `source_payload` ficam intocados.
 *
 * O tipo do evento (`juridico_process_changed`) e a chave de integracao sao os mesmos de antes da
 * capacidade: as regras `juridico_process_moved` continuam valendo e um acompanhamento migrado nao
 * repete o evento ja registrado para o mesmo retrato.
 */
@Injectable()
export class FlowProcessMovementDelivery implements OnModuleInit {
  private readonly logger = new Logger(FlowProcessMovementDelivery.name);

  constructor(
    private readonly registry: ProcessMonitoringDeliveryRegistry,
    private readonly activities: ActivitiesService,
    private readonly cards: CardsRepository,
    private readonly emailAutomations: EmailAutomationOutboxService,
    private readonly updates: FlowMonitoringUpdatesService
  ) {}

  onModuleInit(): void {
    this.registry.register('flow', this);
  }

  async deliver(notification: ProcessMovementNotification): Promise<void> {
    const ref = notification.destinationRef;
    if (!('cardId' in ref)) throw new Error('Flow destination without card');
    // Regra `juridico_process_moved` dispara so se o card estiver, no momento do evento, na coluna da
    // regra; a coluna vai no proprio evento e o outbox duravel deriva a intencao.
    const boardColumnId = await this.currentColumn(ref.databaseRef, notification.clientId, ref.boardId, ref.cardId);
    const activity = await this.activities.recordIntegrationEvent({
      databaseRef: ref.databaseRef,
      clientId: notification.clientId,
      cardId: ref.cardId,
      authorIdentityId: notification.requestedByIdentityId,
      integrationKey: `juridico-process:${notification.monitorId}:${notification.processFingerprint}`,
      kind: 'juridico_process_changed',
      payload: {
        fonte: 'datajud',
        numeroProcesso: notification.numeroProcesso,
        tribunal: notification.tribunal,
        novasMovimentacoes: notification.newMovements,
        detectadoEm: new Date().toISOString(),
        boardColumnId
      }
    });
    await this.emailAutomations.recordForActivity(ref.databaseRef, notification.clientId, activity.id);
    // Sino do dia (flow-offices-sprints.md, S6).
    await this.updates.record({ clientId: notification.clientId, source: 'datajud', cardId: ref.cardId, boardId: ref.boardId, processNumber: notification.numeroProcesso });
  }

  /**
   * Publicacao nova do DJEN (ADR 022): um `system_event` `djen_publication_received` por publicacao no
   * historico do card. Regras `djen_publication_received` da coluna atual reagem (Sprint 8): e-mail pelo
   * outbox duravel, "Ir para a coluna" pelo motor de movimento.
   */
  async deliverPublications(notification: ProcessPublicationNotification): Promise<void> {
    const ref = notification.destinationRef;
    if (!('cardId' in ref)) throw new Error('Flow destination without card');
    const boardColumnId = await this.currentColumn(ref.databaseRef, notification.clientId, ref.boardId, ref.cardId);
    for (const publication of notification.publications) {
      const activity = await this.activities.recordIntegrationEvent({
        databaseRef: ref.databaseRef,
        clientId: notification.clientId,
        cardId: ref.cardId,
        authorIdentityId: notification.requestedByIdentityId,
        integrationKey: `djen-publication:${notification.monitorId}:${publication.id}`,
        kind: 'djen_publication_received',
        payload: {
          fonte: 'djen',
          numeroProcesso: notification.numeroProcesso,
          publicacao: {
            dataDisponibilizacao: publication.availableOn,
            tipoComunicacao: publication.communicationType,
            tipoDocumento: publication.documentType,
            orgao: publication.courtName,
            trecho: publication.excerpt
          },
          detectadoEm: new Date().toISOString(),
          boardColumnId
        }
      });
      await this.emailAutomations.recordForActivity(ref.databaseRef, notification.clientId, activity.id);
    }
    if (notification.publications.length > 0) {
      await this.updates.record({ clientId: notification.clientId, source: 'djen', cardId: ref.cardId, boardId: ref.boardId, processNumber: notification.numeroProcesso });
    }
  }

  /** Coluna atual do card para o evento; falha de leitura nunca impede o registro do evento. */
  private async currentColumn(databaseRef: string, clientId: string, boardId: string, cardId: string): Promise<string | null> {
    try {
      return (await this.cards.findById(databaseRef, clientId, boardId, cardId))?.boardColumnId ?? null;
    } catch (error) {
      this.logger.error(`Failed to read card ${cardId} column for juridico_process_changed: ${(error as Error).message}`);
      return null;
    }
  }
}
