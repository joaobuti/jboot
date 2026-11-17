import { Injectable } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AiAutomationOutboxRepository } from '../automation/ai-automation-outbox.repository';
import { expectedResultOf } from '../automation/expected-result';
import { ValidationToolError } from '../customer-validation/customer-validation.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { ActionAnalysisInput, validateActionAnalysis } from './action-analysis.input';
import { ActionAnalysisRepository, ActionAnalysisRow } from './action-analysis.repository';

/**
 * Analise de Acoes com retorno estruturado (docs/product/flow-action-analysis-sprints.md, A1;
 * ADR 019, decisao 18). A rotina devolve as acoes; o Flow confere, grava vinculado ao card e ao
 * cliente e encerra a execucao. Concluida com ao menos uma acao, grava `ai.automation_completed`: o
 * card anda pelas regras `ai_completed -> move_card` da coluna. A IA nunca move o card.
 */
@Injectable()
export class ActionAnalysisService {
  constructor(
    private readonly repository: ActionAnalysisRepository,
    private readonly outbox: AiAutomationOutboxRepository,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly visibility: CardVisibilityService,
    private readonly activities: ActivitiesRepository,
    private readonly audit: KanbanAuditService
  ) {}

  async latestForCard(context: KanbanRequestContext, boardId: string, cardId: string): Promise<ActionAnalysisRow | null> {
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    return this.repository.latestForCard(context.databaseRef, context.clientId, cardId);
  }

  /**
   * Peticoes iniciais (ADR 020, S3): a rotina le a Analise de Acoes concluida mais recente do card,
   * com o id de cada acao para o vinculo peticao x acao. `analysis` nulo: a rotina faz a triagem da
   * secao 4.3 pelo HISCON e diz isso no relatorio.
   */
  async connectorLatestConcluded(context: KanbanRequestContext, runId: string, mutate: MutateContext) {
    const run = await this.outbox.findDispatchedForOwner(context.databaseRef, context.clientId, runId, context.identityId);
    if (!run) throw new ValidationToolError('not_found', 'Execucao de automacao nao encontrada, ja encerrada ou de outro usuario.');
    await this.outbox.touchDispatched(context.databaseRef, context.clientId, run.id);
    if (expectedResultOf(run.actionConfig) !== 'initial_petitions') {
      throw new ValidationToolError('wrong_expected_result', 'A analise de acoes so e lida pela automacao de Peticoes iniciais.');
    }
    await this.visibility.requireVisibleCard(context, run.boardId, run.cardId);
    const analysis = await this.repository.latestConcludedForCard(context.databaseRef, context.clientId, run.cardId);
    await this.audit.record('kanban_automation_action_analysis_read', mutate, run.boardId, {
      runId: run.id,
      cardId: run.cardId,
      analysisId: analysis?.id ?? null
    });
    if (!analysis) {
      return {
        runId,
        analysis: null,
        instructions: 'O card nao tem Analise de Acoes concluida: faca a triagem da secao 4.3 pelo HISCON e informe isso no relatorio.'
      };
    }
    return {
      runId,
      analysis: {
        analysisId: analysis.id,
        createdAt: analysis.createdAt,
        header: { holderName: analysis.holderName, benefitNumber: analysis.benefitNumber, statementDate: analysis.statementDate },
        actions: analysis.actions.map((action) => ({
          actionId: action.id,
          block: action.block,
          position: action.position,
          bank: action.bank,
          year: action.year,
          rootContract: action.rootContract,
          observations: action.observations,
          contracts: action.contracts
        }))
      },
      instructions: 'Cada peticao aponta os actionId que cobre; acao sem peticao vai ao relatorio com o motivo.'
    };
  }

  async connectorSubmit(context: KanbanRequestContext, runId: string, input: ActionAnalysisInput, mutate: MutateContext) {
    const run = await this.outbox.findDispatchedForOwner(context.databaseRef, context.clientId, runId, context.identityId);
    if (!run) throw new ValidationToolError('not_found', 'Execucao de automacao nao encontrada, ja encerrada ou de outro usuario.');
    await this.outbox.touchDispatched(context.databaseRef, context.clientId, run.id);
    const expected = expectedResultOf(run.actionConfig);
    if (expected !== null && expected !== 'action_analysis') {
      throw new ValidationToolError('wrong_expected_result', 'Esta automacao nao espera Analise de Acoes; nada foi gravado.');
    }
    await this.visibility.requireVisibleCard(context, run.boardId, run.cardId);
    const link = await this.cardCustomers.findByCard(context.databaseRef, context.clientId, run.cardId);
    if (!link) throw new ValidationToolError('card_without_customer', 'O card nao tem cliente vinculado.');

    const errors = validateActionAnalysis(input);
    if (errors.length > 0) {
      throw new ValidationToolError('invalid_analysis', `Analise recusada, nada foi gravado. Corrija e envie de novo: ${errors.join(' ')}`);
    }

    const created = await this.repository.createClosingRun(context.databaseRef, context.clientId, {
      runId: run.id,
      cardId: run.cardId,
      customerId: link.customerId,
      ownerIdentityId: context.identityId,
      analysis: input
    });
    if (!created) throw new ValidationToolError('run_closed', 'Esta execucao ja foi encerrada; a analise nao foi gravada.');

    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      run.cardId,
      context.identityId,
      'card.action_analysis_registered',
      { analysisId: created.id, status: input.status, actionCount: input.actions.length, completed: created.completedEvent },
      `action-analysis:${created.id}`
    );
    await this.audit.record('kanban_action_analysis_registered', mutate, run.boardId, {
      runId: run.id,
      cardId: run.cardId,
      analysisId: created.id,
      status: input.status,
      actionCount: input.actions.length,
      completed: created.completedEvent
    });
    return { analysisId: created.id, actionCount: input.actions.length, runCompleted: true, automationCompleted: created.completedEvent };
  }
}
