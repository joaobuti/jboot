import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { formatCnj, inferCnjTribunal, normalizeCnj } from '../../shared/documents/cnj';
import { ActivitiesRepository } from '../activities/activities.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { PetitionProtocolRepository } from './petition-protocol.repository';

/**
 * Numero do processo (CNJ) registrado manualmente na peticao aprovada, enquanto o protocolo automatico
 * nos portais nao existe (docs/product/flow-card-actions-sprints.md, Sprint 2). A futura acao
 * `gerar-protocolo` preenche o mesmo campo. Corrigir ou desvincular o numero esta fora desta sprint.
 */
@Injectable()
export class PetitionProtocolService {
  constructor(
    private readonly repository: PetitionProtocolRepository,
    private readonly visibility: CardVisibilityService,
    private readonly access: BoardAccessService,
    private readonly activities: ActivitiesRepository,
    private readonly audit: KanbanAuditService
  ) {}

  /** `board_admin` (efetivo) do board ou responsavel pelo card com papel de edicao no board. */
  async canRegister(context: KanbanRequestContext, boardId: string, cardId: string): Promise<boolean> {
    const role = (await this.access.resolveEffectiveRole(context, boardId))?.role ?? null;
    if (role === 'board_admin') return true;
    if (role !== 'board_member') return false;
    return this.repository.isCardAssignee(context.databaseRef, context.clientId, cardId, context.identityId);
  }

  async register(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    petitionId: string,
    rawNumber: string,
    mutate: MutateContext
  ): Promise<{ petitionId: string; protocolNumber: string; tribunal: string }> {
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    if (card.status !== 'active') throw new NotFoundException('Card not found');
    if (!(await this.canRegister(context, boardId, cardId))) {
      throw new ForbiddenException({
        code: 'petition_protocol_forbidden',
        message: 'Somente o administrador do board ou o responsavel pelo card registra o numero do processo.'
      });
    }
    const processNumber = normalizeCnj(rawNumber);
    if (!processNumber) {
      throw new UnprocessableEntityException({ code: 'invalid_process_number', message: 'Numero do processo (CNJ) invalido: confira os 20 digitos.' });
    }
    const tribunal = inferCnjTribunal(processNumber);
    if (!tribunal) {
      throw new UnprocessableEntityException({
        code: 'process_number_tribunal_unknown',
        message: 'Nao foi possivel identificar o tribunal pelo numero do processo (segmento J.TR).'
      });
    }
    const result = await this.repository.register(context.databaseRef, context.clientId, cardId, petitionId, processNumber, context.identityId);
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          throw new NotFoundException({ code: 'petition_not_found', message: 'Peticao nao encontrada.' });
        case 'not_approved':
          throw new ConflictException({ code: 'petition_not_approved', message: 'Registre o numero do processo depois de aprovar a peticao.' });
        case 'already_registered':
          throw new ConflictException({ code: 'petition_protocol_already_registered', message: 'Esta peticao ja tem numero do processo.' });
        case 'number_in_use':
          throw new ConflictException({
            code: 'process_number_in_use',
            message: 'Ja existe um card com este numero do processo.',
            cardId: result.owner.cardId,
            cardUrl: `/flow/boards/${result.owner.boardId}?card=${result.owner.cardId}`
          });
      }
    }
    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      cardId,
      context.identityId,
      'card.initial_petition_protocol_registered',
      { petitionId, processNumber: formatCnj(processNumber), tribunal },
      `initial-petition-protocol:${petitionId}`
    );
    await this.audit.record('kanban_initial_petition_protocol_registered', mutate, boardId, { cardId, petitionId, tribunal });
    return { petitionId, protocolNumber: processNumber, tribunal };
  }
}
