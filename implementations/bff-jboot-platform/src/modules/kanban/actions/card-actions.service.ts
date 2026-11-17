import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ColumnsRepository } from '../columns/columns.repository';
import { ColumnsService } from '../columns/columns.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { PetitionProtocolRepository } from '../initial-petitions/petition-protocol.repository';
import { SignedKitRepository } from '../signed-kit/signed-kit.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanViewerResolver } from '../shared/kanban-viewer-resolver.service';
import { ACTION_CATEGORIES, requireCardAction, selectableCardActions } from './action-catalog';
import { CardActionHandlers } from './card-action-handlers.service';
import { CardActionsRepository, ColumnActionConfig } from './card-actions.repository';
import { canConfigureCardActions, canExecuteCardActions } from './card-actions.policy';
import { ReplaceColumnActionsDto } from './dto/card-actions.dto';

@Injectable()
export class CardActionsService {
  constructor(
    private readonly repository: CardActionsRepository,
    private readonly columns: ColumnsRepository,
    private readonly visibleColumns: ColumnsService,
    private readonly access: BoardAccessService,
    private readonly visibility: CardVisibilityService,
    private readonly handlers: CardActionHandlers,
    private readonly petitions: PetitionProtocolRepository,
    private readonly viewers: KanbanViewerResolver,
    private readonly signedKits: SignedKitRepository
  ) {}

  async list(context: KanbanRequestContext, boardId: string) {
    await this.access.requireBoard(context, boardId);
    const canConfigure = canConfigureCardActions(context);
    const columns = canConfigure
      ? await this.columns.list(context.databaseRef, context.clientId, boardId)
      : (await this.visibleColumns.list(context, boardId)).data;
    const assignments = await this.repository.list(context.databaseRef, context.clientId, boardId, columns.map(column => column.id));
    // Acoes por card: o botao so aparece nos cards em que a acao tem o que fazer. A listagem e
    // conveniencia de tela; o endpoint da acao revalida tudo.
    const assignedIds = new Set(assignments.map(item => item.actionId));
    const availableCardIds: Record<string, string[]> = {};
    if (assignedIds.has('monitorar')) {
      availableCardIds.monitorar = await this.petitions.monitorableCardIds(
        context.databaseRef, context.clientId, boardId, await this.viewers.resolve(context));
    }
    if (assignedIds.has('validar-assinatura')) {
      availableCardIds['validar-assinatura'] = await this.signedKits.validatableCardIds(
        context.databaseRef, context.clientId, boardId, await this.viewers.resolve(context));
    }
    return {
      categories: ACTION_CATEGORIES, actions: selectableCardActions(),
      columns: columns.map(({ id, name }) => ({ id, name })),
      // Quem configurou executa as acoes de IA; a tela avisa quando salvar troca a conta executora.
      assignments: assignments.map(({ configuredByIdentityId, ...item }) => ({
        ...item, configuredByCurrentUser: configuredByIdentityId === context.identityId
      })),
      availableCardIds,
      canConfigure, canExecute: canExecuteCardActions(context)
    };
  }

  async replace(context: MutateContext, boardId: string, columnId: string, dto: ReplaceColumnActionsDto): Promise<void> {
    if (!canConfigureCardActions(context)) {
      throw new ForbiddenException({ code: 'card_actions_admin_required', message: 'Somente o master do cliente ou administrador Senior configura ações' });
    }
    await this.access.requireBoard(context, boardId);
    const configs: Record<string, ColumnActionConfig> = {};
    for (const action of dto.actionIds.map(requireCardAction)) {
      if (action.config !== 'routine_agent') continue;
      const agentId = dto.configs?.find(item => item.actionId === action.id)?.agentId;
      if (!agentId) {
        throw new BadRequestException({ code: 'card_action_config_required', message: `${action.label} exige um agente de IA` });
      }
      configs[action.id] = { agentId };
    }
    const unexpected = dto.configs?.find(item => !configs[item.actionId]);
    if (unexpected) {
      throw new BadRequestException({ code: 'card_action_config_not_allowed', message: 'Configuração enviada para ação que não a usa ou não foi atribuída' });
    }
    await this.repository.replace(context, boardId, columnId, dto.actionIds, configs);
  }

  async execute(context: MutateContext, boardId: string, cardId: string, actionId: string) {
    if (!canExecuteCardActions(context)) {
      throw new ForbiddenException({ code: 'card_actions_execute_required', message: 'Permissão Executar ações necessária' });
    }
    const action = requireCardAction(actionId);
    if (action.interaction === 'dialog') {
      throw new BadRequestException({ code: 'card_action_requires_dialog', message: `${action.label} abre a tela propria da ação.` });
    }
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    if (card.status !== 'active') throw new NotFoundException('Card not found');
    await this.requireEditable(context, boardId, card.boardColumnId);
    const assignment = await this.repository.confirmExecution(context, boardId, cardId, card.boardColumnId, action.id);
    return this.handlers.execute(context, boardId, cardId, action.id, assignment);
  }

  /**
   * Pre-condicoes de executar uma acao no card, sem efeito: permissao, card ativo e visivel, coluna
   * editavel e acao atribuida a coluna atual. Usado pelas acoes de tela (`interaction: 'dialog'`).
   */
  async requireExecutable(context: KanbanRequestContext, boardId: string, cardId: string, actionId: string) {
    if (!canExecuteCardActions(context)) {
      throw new ForbiddenException({ code: 'card_actions_execute_required', message: 'Permissão Executar ações necessária' });
    }
    const action = requireCardAction(actionId);
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    if (card.status !== 'active') throw new NotFoundException('Card not found');
    await this.requireEditable(context, boardId, card.boardColumnId);
    if (!(await this.repository.isAssigned(context.databaseRef, context.clientId, boardId, card.boardColumnId, action.id))) {
      throw new ForbiddenException({ code: 'card_action_not_assigned', message: 'Ação não atribuída à coluna atual do card' });
    }
    return card;
  }

  private async requireEditable(context: KanbanRequestContext, boardId: string, columnId: string): Promise<void> {
    if (canConfigureCardActions(context)) return;
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    await this.access.requireColumnEditable(context, boardId, columnId);
  }
}
