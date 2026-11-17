import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MutateContext } from '../../kanban/kanban.types';
import { CardsService } from '../../kanban/cards/cards.service';
import { PjeRepository } from '../../juridico/pje/pje.repository';
import { DomainApplicationContextService } from '../application-context.service';
import { DomainIntegrationRequestContext } from '../domain-integration.types';
import { DomainIntegrationsRepository } from '../domain-integrations.repository';
import { ExportToFlowResponseDto } from '../dto/domain-integration.dto';
import { mapPjeCommunicationToFlowCard } from '../mappers/flow-card.mapper';

@Injectable()
export class PjeToFlowExporter {
  private readonly logger = new Logger(PjeToFlowExporter.name);

  constructor(
    private readonly contexts: DomainApplicationContextService,
    private readonly repository: DomainIntegrationsRepository,
    private readonly cards: CardsService,
    private readonly pje: PjeRepository
  ) {}

  async execute(
    caller: DomainIntegrationRequestContext,
    communicationId: string,
    boardId: string,
    /** Escritorio do card no Flow: obrigatorio (regra de escritorio da Sprint 3.5). */
    officeId: string,
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ): Promise<ExportToFlowResponseDto> {
    const operationKey = `pje:${communicationId}:flow:${boardId}`;
    let stage = 'authorize';
    try {
      const juridico = await this.contexts.requireCaller(caller, 'juridico', ['juridico:read']);
      const flow = await this.contexts.requireApplication(caller, 'flow', ['flow:read', 'flow:write']);
      stage = 'load_source';
      const communication = await this.pje.getComunicacao(caller.clientId, juridico.databaseRef, communicationId);
      if (!communication) throw new NotFoundException('Juridico communication not found');

      stage = 'write_destination';
      const result = await this.cards.createInDefaultColumnFromSource(
        flow,
        boardId,
        { ...mapPjeCommunicationToFlowCard(communication), officeId },
        { ...flow, ...requestInfo }
      );

      stage = 'write_audit';
      await this.repository.insertExportAudit(juridico.databaseRef, {
        clientId: caller.clientId,
        identityId: caller.identityId,
        eventType: 'juridico.pje.comunicacao.exported_to_flow',
        operationKey,
        payload: {
          comunicacaoId: communicationId,
          numeroProcesso: communication.numeroProcessoMask ?? communication.numeroProcesso ?? null,
          siglaTribunal: communication.siglaTribunal ?? null,
          boardId,
          cardId: result.card.id,
          created: result.created
        },
        ip: requestInfo.ip ?? null
      });
      this.log(operationKey, 'completed', 'complete', result.created);
      return {
        boardId,
        cardId: result.card.id,
        cardUrl: `/flow/boards/${boardId}?card=${result.card.id}`,
        created: result.created
      };
    } catch (error) {
      this.log(operationKey, 'failed', stage);
      throw error;
    }
  }

  private log(operationKey: string, status: 'completed' | 'failed', stage: string, created?: boolean): void {
    const message = JSON.stringify({ event: 'domain_integration', operationKey, status, stage, created });
    if (status === 'failed') this.logger.error(message);
    else this.logger.log(message);
  }
}
