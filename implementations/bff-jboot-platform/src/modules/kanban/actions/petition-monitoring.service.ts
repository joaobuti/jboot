import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatCnj, inferCnjTribunal } from '../../shared/documents/cnj';
import { ActivitiesRepository } from '../activities/activities.repository';
import { BoardsRepository } from '../boards/boards.repository';
import { CardsService } from '../cards/cards.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { isMonitorable, PetitionProtocolRepository, ProtocolPetitionRow } from '../initial-petitions/petition-protocol.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CardActionsService } from './card-actions.service';

export const MONITOR_ACTION_ID = 'monitorar';
export const PETITION_SOURCE = { module: 'kanban', type: 'flow_petition' } as const;

const COURT_LABEL: Record<ProtocolPetitionRow['court'], string> = { jec: 'Juizado Especial Civel', jef: 'Juizado Especial Federal' };

export interface MonitorablePetitionView {
  id: string;
  fileName: string;
  bank: string;
  court: ProtocolPetitionRow['court'];
  processNumber: string;
}

export interface MonitoringCardResult {
  petitionId: string;
  processNumber: string;
  tribunal: string;
  boardId: string;
  cardId: string;
  /** `false` quando a peticao ja tinha sido enviada (reenvio ou retomada): devolve o card existente. */
  created: boolean;
}

/**
 * Lado Kanban da acao Monitorar (docs/product/flow-card-actions-sprints.md, Sprint 2): a peticao
 * aprovada com numero do processo vira card novo na coluna padrao do board de monitoramento escolhido.
 * O monitor DataJud e o vinculo card -> monitor ficam em `domain-integrations`, que chama este servico.
 */
@Injectable()
export class PetitionMonitoringService {
  constructor(
    private readonly actions: CardActionsService,
    private readonly petitions: PetitionProtocolRepository,
    private readonly boards: BoardsRepository,
    private readonly cards: CardsService,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly activities: ActivitiesRepository,
    private readonly audit: KanbanAuditService
  ) {}

  async options(context: KanbanRequestContext, boardId: string, cardId: string) {
    await this.actions.requireExecutable(context, boardId, cardId, MONITOR_ACTION_ID);
    const [petitions, boards] = await Promise.all([
      this.petitions.findMonitorable(context.databaseRef, context.clientId, cardId),
      this.boards.listImportDestinations(context.databaseRef, context.clientId, context.identityId, context.scopes.includes('flow:admin'))
    ]);
    return {
      petitions: petitions.map((petition): MonitorablePetitionView => ({
        id: petition.id,
        fileName: petition.fileName,
        bank: petition.bank,
        court: petition.court,
        processNumber: formatCnj(petition.protocolNumber ?? '')
      })),
      // O destino e outro board: o de origem fica fora da lista (e o envio para ele e recusado).
      boards: boards.filter((board) => board.id !== boardId).map(({ id, name }) => ({ id, name })),
      // Criar board e do administrador (`POST /kanban/boards` exige `flow:admin`).
      canCreateBoard: context.scopes.includes('flow:admin')
    };
  }

  /**
   * Cria (ou devolve, se ja enviada) o card de monitoramento da peticao. Reexecutar depois de falha
   * parcial retoma do ponto em que parou: o card fica na peticao e o chamador completa o monitor.
   */
  async createMonitoringCard(
    context: KanbanRequestContext,
    mutate: MutateContext,
    boardId: string,
    cardId: string,
    petitionId: string,
    targetBoardId: string
  ): Promise<MonitoringCardResult> {
    if (targetBoardId === boardId) {
      throw new BadRequestException({ code: 'monitoring_board_same_as_origin', message: 'Escolha um board diferente do board de origem.' });
    }
    const origin = await this.actions.requireExecutable(context, boardId, cardId, MONITOR_ACTION_ID);
    const petition = (await this.petitions.findForCard(context.databaseRef, context.clientId, cardId)).find((item) => item.id === petitionId);
    if (!petition) throw new NotFoundException({ code: 'petition_not_found', message: 'Peticao nao encontrada.' });
    const processNumber = petition.protocolNumber;
    const tribunal = processNumber ? inferCnjTribunal(processNumber) : null;
    if (!processNumber || !tribunal) {
      throw new ConflictException({ code: 'petition_without_process_number', message: 'Registre o numero do processo (CNJ) antes de monitorar.' });
    }
    if (petition.monitoringCardId && petition.monitoringBoardId) {
      return { petitionId, processNumber, tribunal, boardId: petition.monitoringBoardId, cardId: petition.monitoringCardId, created: false };
    }
    if (!isMonitorable(petition)) {
      throw new ConflictException({ code: 'petition_not_monitorable', message: 'A peticao precisa estar aprovada para ir ao monitoramento.' });
    }

    const masked = formatCnj(processNumber);
    const originUrl = `/flow/boards/${boardId}?card=${cardId}`;
    const created = await this.cards.createInDefaultColumnFromSource(
      context,
      targetBoardId,
      {
        sourceModule: PETITION_SOURCE.module,
        sourceType: PETITION_SOURCE.type,
        sourceId: petitionId,
        // Titulo = cliente (o card de origem); o numero do processo aparece abaixo, na face do card.
        title: (origin.title?.trim() || `Processo ${masked}`).slice(0, 200),
        description: [
          `Numero do processo (CNJ): ${masked}`,
          `Tribunal: ${tribunal}`,
          `Juizo: ${COURT_LABEL[petition.court]}`,
          `Banco: ${petition.bank}`,
          `Peticao: ${petition.fileName}`,
          `Card de origem: ${originUrl}`
        ].join('\n'),
        sourcePayload: {
          petitionId,
          processNumber,
          tribunal,
          court: petition.court,
          bank: petition.bank,
          fileName: petition.fileName,
          originBoardId: boardId,
          originCardId: cardId
        },
        sourceUrl: originUrl,
        officeId: origin.officeId
      },
      mutate
    );

    // Cliente antes de marcar a peticao: um retry depois de falha aqui ainda passa por este ponto.
    await this.cardCustomers.replace(context.databaseRef, context.clientId, created.card.id, petition.customerId, context.identityId);
    const sent = await this.petitions.markSent(
      context.databaseRef,
      context.clientId,
      petitionId,
      { boardId: targetBoardId, cardId: created.card.id },
      context.identityId
    );
    if (sent.cardId !== created.card.id) {
      // Outro envio venceu; o card que este pedido criou sai e o vencedor e devolvido.
      if (created.created) await this.petitions.discardLosingCard(context.databaseRef, context.clientId, targetBoardId, created.card.id, petitionId);
      return { petitionId, processNumber, tribunal, boardId: sent.boardId, cardId: sent.cardId, created: false };
    }

    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      cardId,
      context.identityId,
      'card.initial_petition_sent_to_monitoring',
      { petitionId, processNumber: masked, targetBoardId, targetCardId: created.card.id },
      `initial-petition-monitoring-origin:${petitionId}`
    );
    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      created.card.id,
      context.identityId,
      'card.monitoring_card_created',
      { petitionId, processNumber: masked, originBoardId: boardId, originCardId: cardId },
      `initial-petition-monitoring-target:${petitionId}`
    );
    await this.audit.record('kanban_initial_petition_sent_to_monitoring', mutate, boardId, {
      cardId,
      petitionId,
      targetBoardId,
      targetCardId: created.card.id
    });
    return { petitionId, processNumber, tribunal, boardId: targetBoardId, cardId: created.card.id, created: true };
  }
}
