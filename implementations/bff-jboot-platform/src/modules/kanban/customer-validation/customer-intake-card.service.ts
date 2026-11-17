import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { CustomersService } from '../../establishment-customers/customers.service';
import { AssigneesService } from '../assignees/assignees.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { FlowCustomersRepository } from '../flow-customers/flow-customers.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CustomerValidationRepository, IntakeAssignees, IntakeResult, ValidationRunRow } from './customer-validation.repository';

/** Coluna de entrada do card do cliente validado (decisao do usuario, 2026-10-26: sempre BACKLOG). */
export const INTAKE_COLUMN_NAME = 'BACKLOG';

export interface IntakeOutcome {
  result: IntakeResult;
  boardId: string | null;
  cardId: string | null;
  /** So no card criado agora: responsaveis do escritorio atribuidos e os que ficaram de fora. */
  assignees?: IntakeAssignees;
}

/**
 * Card automatico na confirmacao da validacao (ADR 019, decisao 16): o cliente confirmado ganha um
 * card na coluna BACKLOG do board de entrada do escritorio do pedido, ja com o cliente vinculado.
 * E acao do sistema em nome de quem confirmou (`flow:validation:approve`), auditada; nunca desfaz a
 * confirmacao: sem board, sem BACKLOG ou com falha, o resultado fica registrado na validacao.
 * O card criado recebe como responsaveis todos os responsaveis do escritorio (aba Usuarios); quem nao e
 * membro ativo do board ou nao ve o card fica de fora e a validacao mostra quem e por que (2026-10-29).
 */
@Injectable()
export class CustomerIntakeCardService {
  private readonly logger = new Logger(CustomerIntakeCardService.name);

  constructor(
    private readonly validations: CustomerValidationRepository,
    private readonly columns: ColumnsRepository,
    private readonly flowCustomers: FlowCustomersRepository,
    private readonly customerCore: CustomersService,
    private readonly audit: KanbanAuditService,
    private readonly assignees: AssigneesService
  ) {}

  async createForConfirmed(context: KanbanRequestContext, run: ValidationRunRow, mutate: MutateContext): Promise<IntakeOutcome> {
    let outcome: IntakeOutcome;
    try {
      outcome = await this.resolve(context, run, mutate);
    } catch (error) {
      this.logger.warn(`validation ${run.id}: intake card not created (${error instanceof Error ? error.message : 'error'})`);
      outcome = { result: 'failed', boardId: null, cardId: null };
    }
    await this.validations.setIntake(
      context.databaseRef, context.clientId, run.id, outcome.result, outcome.boardId, outcome.cardId, outcome.assignees ?? null
    );
    await this.audit.record('kanban_customer_validation_intake_card', mutate, outcome.boardId, {
      customerId: run.customerId,
      runId: run.id,
      result: outcome.result,
      cardId: outcome.cardId,
      ...(outcome.assignees ? { assigneeIds: outcome.assignees.assigned, skippedAssignees: outcome.assignees.skipped } : {})
    });
    return outcome;
  }

  private async resolve(context: KanbanRequestContext, run: ValidationRunRow, mutate: MutateContext): Promise<IntakeOutcome> {
    const officeId = run.intakeOfficeId ?? run.contractOfficeId ?? run.officeId;
    if (!officeId) return { result: 'no_office', boardId: null, cardId: null };
    const boardId = (await this.validations.listIntakeBoards(context.databaseRef, context.clientId)).get(officeId) ?? null;
    if (!boardId) return { result: 'no_board', boardId: null, cardId: null };
    const columns = await this.columns.list(context.databaseRef, context.clientId, boardId);
    const backlog = columns.find((column) => column.status === 'active' && column.name.trim().toUpperCase() === INTAKE_COLUMN_NAME);
    if (!backlog) return { result: 'no_backlog', boardId, cardId: null };
    // Cliente ja com card ativo neste board: nao duplica (revalidacao, card criado a mao).
    const existing = await this.validations.findActiveCustomerCard(context.databaseRef, context.clientId, boardId, run.customerId);
    if (existing) return { result: 'existing', boardId, cardId: existing };
    const customer = await this.customerCore.findForFlowById(context.clientId, run.customerId);
    const title = (customer?.name ?? 'Cliente').slice(0, 200);
    const created = await this.flowCustomers.createCardFromCustomer(context.databaseRef, context.clientId, {
      // Uma criacao por validacao confirmada; repetir a confirmacao nao gera outro card.
      idempotencyKey: `validation-intake:${run.id}`,
      requestHash: createHash('sha256').update(JSON.stringify([run.customerId, boardId, backlog.id, officeId, title])).digest('hex'),
      customerId: run.customerId,
      boardId,
      columnId: backlog.id,
      officeId,
      title,
      identityId: context.identityId,
      ip: mutate.ip,
      userAgent: mutate.userAgent
    });
    return { result: 'created', boardId, cardId: created.cardId, assignees: await this.assignResponsibles(context, boardId, created.cardId, officeId, run, mutate) };
  }

  /** Falha aqui nao desfaz o card: fica `error` no resultado e o card segue sem responsavel. */
  private async assignResponsibles(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    officeId: string,
    run: ValidationRunRow,
    mutate: MutateContext
  ): Promise<IntakeAssignees> {
    try {
      const responsibles = await this.validations.listOfficeResponsibles(context.databaseRef, context.clientId, officeId);
      return await this.assignees.assignBySystem(context, boardId, cardId, responsibles, mutate);
    } catch (error) {
      this.logger.warn(`validation ${run.id}: intake card assignees not set (${error instanceof Error ? error.message : 'error'})`);
      return { assigned: [], skipped: [], error: 'assign_failed' };
    }
  }
}
