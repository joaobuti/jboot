import { Injectable } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AiAutomationOutboxRepository } from './ai-automation-outbox.repository';
import { AiGatewayClientService, AiGatewayRequestError } from './ai-gateway-client.service';
import { CLAUDE_ROUTINE_TOOL_POLICY } from './automation-rules.service';
import { AiAutomationOutboxRow } from './ai-automation-outbox.repository';
import { PetitionPreconditionsService } from '../initial-petitions/petition-preconditions.service';
import { AUTOMATION_COMPLETION_INSTRUCTIONS, completionInstructionsFor, isAutomationCompletion } from './automation-completion';
import { expectedResultOf } from './expected-result';

const MAX_ROUTINE_DISPATCHES = 5;

@Injectable()
export class AiAutomationProcessorService {
  constructor(
    private readonly outbox: AiAutomationOutboxRepository,
    private readonly gateway: AiGatewayClientService,
    private readonly activities: ActivitiesRepository,
    private readonly petitions: PetitionPreconditionsService,
  ) {}

  async process(databaseRef: string, outboxId: string): Promise<void> {
    const row = await this.outbox.claim(databaseRef, outboxId);
    if (!row) return;
    try {
      const routine = row.actionConfig.connectionMode === 'claude_routine';
      if (
        (routine
          ? row.actionConfig.toolPolicyVersion !== CLAUDE_ROUTINE_TOOL_POLICY
          : row.actionConfig.connectionMode !== 'api_key' || !['2026-10-15.v1', '2026-10-21.v1'].includes(String(row.actionConfig.toolPolicyVersion))) ||
        row.actionConfig.inputPolicyVersion !== 1
      ) {
        await this.outbox.markFailed(databaseRef, row.id, 'ai_action_policy_mismatch');
        return;
      }
      const snapshot = await this.outbox.snapshot(databaseRef, row);
      if (!snapshot) {
        await this.outbox.markFailed(databaseRef, row.id, 'ai_source_not_found');
        return;
      }
      if (routine) {
        if (!(await this.petitionPreconditionsMet(databaseRef, row))) return;
        await this.dispatchRoutine(databaseRef, row);
        return;
      }
      const result = await this.gateway.execute({
        clientId: row.clientId,
        requesterIdentityId: row.requesterIdentityId,
        agentId: row.agentId,
        sourceId: row.id,
        idempotencyKey: `kanban-ai-${row.id}`,
        payload: {
          inputPolicyVersion: 1,
          completionInstructions: AUTOMATION_COMPLETION_INSTRUCTIONS,
          trigger: {
            type: row.triggerType,
            sourceActivityId: row.sourceActivityId,
            event: snapshot.event,
          },
          card: snapshot.card,
        },
      });
      if (result.status !== 'succeeded') {
        await this.outbox.markFailed(databaseRef, row.id, result.errorCode ?? 'ai_execution_failed', result.id);
        return;
      }

      let reviewRequired = false;
      let confirmed = false;
      const completionCalls = result.requestedActions.filter(action => action.toolId === 'kanban.automation.complete');
      if (completionCalls.length && (completionCalls.length !== 1 ||
          result.requestedActions.at(-1)?.toolId !== 'kanban.automation.complete' ||
          !isAutomationCompletion(completionCalls[0].arguments))) {
        await this.outbox.markFailed(databaseRef, row.id, 'ai_completion_invalid', result.id);
        return;
      }
      for (const action of result.requestedActions) {
        if (action.toolId === 'kanban.automation.complete') {
          confirmed = true;
          continue;
        }
        if (action.toolId === 'kanban.card.append_activity') {
          const text = action.arguments.text;
          if (typeof text !== 'string' || text.length < 1 || text.length > 8000) {
            await this.outbox.markFailed(databaseRef, row.id, 'ai_tool_arguments_invalid', result.id);
            return;
          }
          await this.activities.createAiComment(
            databaseRef,
            row.clientId,
            row.cardId,
            row.requesterIdentityId,
            text,
            result.id,
            action.callId,
          );
          continue;
        }
        if (action.toolId === 'kanban.card.update_description') {
          const description = action.arguments.description;
          if (typeof description !== 'string' || description.length > 50000) {
            await this.outbox.markFailed(databaseRef, row.id, 'ai_tool_arguments_invalid', result.id);
            return;
          }
          await this.activities.createAiReviewRequest(
            databaseRef,
            row.clientId,
            row.cardId,
            row.requesterIdentityId,
            result.id,
            action.callId,
            action.toolId,
          );
          reviewRequired = true;
          continue;
        }
        await this.outbox.markFailed(databaseRef, row.id, 'ai_tool_not_authorized', result.id);
        return;
      }
      // Pedido de revisao humana nunca e conclusao; sem confirmacao explicita, aguarda.
      if (reviewRequired) await this.outbox.markReviewRequired(databaseRef, row.id, result.id);
      else if (confirmed) await this.outbox.markCompleted(databaseRef, row.id, result.id);
      else await this.outbox.markAwaitingConfirmation(databaseRef, row.id, result.id);
    } catch (error) {
      const code = error instanceof AiGatewayRequestError ? error.code : 'ai_automation_unavailable';
      if (error instanceof AiGatewayRequestError && error.status >= 400 && error.status < 500) {
        await this.outbox.markFailed(databaseRef, row.id, code);
        return;
      }
      await this.outbox.releaseForRetry(databaseRef, row.id, code);
      throw error;
    }
  }

  /**
   * Peticoes iniciais (ADR 020): sem cliente validado, sem UF na ficha ou sem acoes ajuizadas
   * declaradas, a execucao falha antes de chamar a rotina (nao gasta a assinatura Claude) e o motivo
   * fica no historico do card. O card nao se move.
   */
  private async petitionPreconditionsMet(databaseRef: string, row: AiAutomationOutboxRow): Promise<boolean> {
    if (expectedResultOf(row.actionConfig) !== 'initial_petitions') return true;
    const result = await this.petitions.evaluate(databaseRef, row.clientId, row.cardId);
    if (result.ok) return true;
    await this.outbox.markFailed(databaseRef, row.id, result.code);
    await this.activities.createSystemEvent(
      databaseRef,
      row.clientId,
      row.cardId,
      row.requesterIdentityId,
      'card.automation_run_failed',
      { runId: row.id, reason: result.code },
      `automation-run-failed:${row.id}`,
    );
    return false;
  }

  /**
   * Modo rotina: so identificadores vao ao gateway (o snapshot do card nao sai
   * do Kanban); a rotina le o card pelo conector com a ACL do dono. A chave muda
   * so depois de limite da rotina; falha de transporte repete a mesma chave.
   */
  private async dispatchRoutine(databaseRef: string, row: AiAutomationOutboxRow): Promise<void> {
    const result = await this.gateway.execute({
      clientId: row.clientId,
      requesterIdentityId: row.requesterIdentityId,
      agentId: row.agentId,
      sourceId: row.id,
      idempotencyKey: `kanban-ai-${row.id}:routine:${row.dispatchAttempt}`,
      payload: { run_id: row.id, board_id: row.boardId, card_id: row.cardId, trigger: row.triggerType,
        completion_instructions: completionInstructionsFor(row.actionConfig) },
    });
    if (result.status === 'dispatched') {
      await this.outbox.markDispatched(databaseRef, row.id, result.id, result.externalSessionUrl ?? null);
      return;
    }
    const code = result.errorCode ?? 'ai_execution_failed';
    if (result.retryAfterSeconds && row.dispatchAttempt < MAX_ROUTINE_DISPATCHES) {
      await this.outbox.rescheduleRoutine(databaseRef, row.id, code, result.retryAfterSeconds);
      return;
    }
    await this.outbox.markFailed(databaseRef, row.id, code, result.id);
  }
}
