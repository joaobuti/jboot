import { HttpException, Injectable, Logger } from '@nestjs/common';
import { CardsService } from '../cards/cards.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { FlowAdminDirectory } from '../shared/flow-admin-directory.service';
import { KanbanGateway } from '../realtime/kanban.gateway';
import { MovementAutomationRepository, MovementAutomationRun } from './movement-automation.repository';
import { ScheduledAutomationRepository } from './scheduled-automation.repository';

@Injectable()
export class MovementAutomationService {
  private readonly logger = new Logger(MovementAutomationService.name);
  constructor(
    private readonly repository: MovementAutomationRepository,
    private readonly tenants: ScheduledAutomationRepository,
    private readonly directory: FlowAdminDirectory,
    private readonly visibility: CardVisibilityService,
    private readonly cards: CardsService,
    private readonly gateway: KanbanGateway
  ) {}

  async recoverAndExecute(): Promise<void> {
    for (const tenant of await this.tenants.listActiveFlowTenants()) {
      try {
        await this.repository.recover(tenant.databaseRef, tenant.clientId);
        for (let i = 0; i < 100; i++) {
          const run = await this.repository.claim(tenant.databaseRef, tenant.clientId);
          if (!run) break;
          await this.execute(tenant.databaseRef, run);
        }
      } catch {
        this.logger.warn(`movement_automation_recovery_failed tenant=${tenant.clientId}`);
      }
    }
  }

  async execute(databaseRef: string, run: MovementAutomationRun): Promise<void> {
    try {
      if (run.depth > 10) {
        await this.repository.finish(databaseRef, run, 'skipped', 'automation_chain_limit');
        return;
      }
      const actor = await this.directory.automationActor(databaseRef,run.clientId,run.ownerIdentityId);
      if (!actor) {
        await this.repository.finish(databaseRef, run, 'skipped', 'automation_owner_not_authorized');
        return;
      }
      const card = await this.visibility.requireVisibleCard(actor,run.boardId,run.cardId);
      if (card.status !== 'active' || card.boardColumnId !== run.columnId || card.boardColumnId === run.destinationColumnId) {
        await this.repository.finish(databaseRef,run,'skipped','automation_card_changed');
        return;
      }
      const moved = await this.cards.move(actor,run.boardId,run.cardId,
        { toBoardColumnId: run.destinationColumnId, toPosition: 0 },actor,
        { expectedColumnId: run.columnId, depth: run.depth, rootActivityId: run.rootActivityId,
          commit: client => this.repository.commit(client,run) });
      await this.gateway.broadcastCardMoved(run.boardId, {
        cardId:run.cardId,fromBoardColumnId:moved.fromBoardColumnId,
        toBoardColumnId:moved.card.boardColumnId,toPosition:moved.card.position,
        movedByIdentityId: actor.identityId, occurredAt: new Date().toISOString()
      });
    } catch (error) {
      const denied = error instanceof HttpException && error.getStatus() < 500;
      await this.repository.finish(databaseRef,run,denied ? 'skipped' : run.attemptCount >= 5 ? 'failed' : 'pending',
        denied ? 'automation_policy_rejected' : 'automation_movement_unavailable');
    }
  }
}
