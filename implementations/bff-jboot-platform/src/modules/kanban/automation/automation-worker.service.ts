import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { OfficeKitEmailService } from '../office-kit-email/office-kit-email.service';
import { MovementAutomationService } from './movement-automation.service';
import { Job, Worker } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';
import { DatabaseService } from '../../../database/database.service';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { CardsRepository } from '../cards/cards.repository';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { ClaimedDispatch, DispatchLogRepository } from './dispatch-log.repository';
import {
  AutomationJobPayload,
  EVALUATE_SCHEDULED_AUTOMATIONS_JOB,
  KANBAN_AUTOMATION_QUEUE_NAME,
  PROCESS_EMAIL_DISPATCH_JOB,
  RECOVER_EMAIL_DISPATCHES_JOB,
  SEND_EMAIL_NOTIFICATION_JOB,
  SEND_SCHEDULED_EMAIL_NOTIFICATION_JOB,
  PROCESS_AI_AUTOMATION_JOB,
  RECOVER_AI_AUTOMATIONS_JOB,
  SendEmailNotificationJobPayload,
  SendScheduledEmailNotificationJobPayload
} from './automation-queue.service';
import { EmailDispatchMetrics, EmailDispatchOutcome } from './email-dispatch-metrics';
import { EmailDispatchSchedulerService } from './email-dispatch-scheduler.service';
import { MailerService } from './mailer.service';
import { ScheduledAutomationEvaluatorService } from './scheduled-automation-evaluator.service';
import { AiAutomationProcessorService } from './ai-automation-processor.service';
import { AiAutomationSchedulerService } from './ai-automation-scheduler.service';

interface IdentityContact {
  identityId: string;
  displayName: string | null;
  email: string | null;
}

type EmailContent =
  | ({ kind: 'column_moved' } & Omit<Parameters<MailerService['sendColumnMovedNotification']>[0], 'to' | 'recipientName'>)
  | ({ kind: 'due_date_approaching' } & Omit<Parameters<MailerService['sendDueDateApproachingNotification']>[0], 'to' | 'recipientName'>)
  | ({ kind: 'card_stale' } & Omit<Parameters<MailerService['sendCardStaleNotification']>[0], 'to' | 'recipientName'>)
  | ({ kind: 'juridico_process_moved' } & Omit<
      Parameters<MailerService['sendJuridicoProcessMovedNotification']>[0],
      'to' | 'recipientName'
    >)
  | ({ kind: 'djen_publication_received' } & Omit<
      Parameters<MailerService['sendDjenPublicationNotification']>[0],
      'to' | 'recipientName'
    >);

/**
 * Worker BullMQ dentro do processo platform-api (sem app/worker standalone novo), consumindo
 * `kanban-column-automation` (identificador conceitual `kanban:column-automation` no gate;
 * BullMQ proibe ":" em nome de fila — ver comentario em automation-queue.service.ts). Ver
 * MODULE_CONTRACT.md, secoes "Motor De Automacao Por Coluna (Sprint 8+)" e "Gatilhos Adicionais
 * De Automacao (Sprint 9+)", e docs/product/kanban-sprint-8-gate.md /
 * docs/product/kanban-sprint-9-gate.md.
 *
 * Sprint 13: o e-mail sai do outbox `kanban_automation_dispatch_log`. O job
 * `process-email-dispatch` leva so databaseRef + id; regra, card e destinatarios
 * sao lidos no envio. Retentativa (1, 2, 4, 8 min) e falha terminal sao do banco;
 * o handler so lanca se o proprio banco falhar (a linha `processing` e retomada
 * pela varredura `recover-email-dispatches` em 5 minutos). Jobs legados
 * (`send-email-notification`, `send-scheduled-email-notification`) ja
 * enfileirados antes do deploy viram linha do outbox e seguem o mesmo caminho.
 */
@Injectable()
export class AutomationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
    private readonly dispatchLog: DispatchLogRepository,
    private readonly cards: CardsRepository,
    private readonly columns: ColumnsRepository,
    private readonly activities: ActivitiesRepository,
    private readonly assignees: AssigneesRepository,
    private readonly mailer: MailerService,
    private readonly scheduledEvaluator: ScheduledAutomationEvaluatorService,
    private readonly visibility: CardVisibilityService,
    private readonly aiProcessor: AiAutomationProcessorService,
    private readonly aiScheduler: AiAutomationSchedulerService,
    private readonly emailScheduler: EmailDispatchSchedulerService,
    private readonly metrics: EmailDispatchMetrics,
    @Inject(MovementAutomationService) private readonly movements: MovementAutomationService | null = null,
    @Optional() private readonly kitEmails?: OfficeKitEmailService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(KANBAN_AUTOMATION_QUEUE_NAME, (job) => this.dispatch(job), {
      connection: { url: this.config.redisUrl } as never
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async dispatch(job: Job): Promise<void> {
    if (job.name === EVALUATE_SCHEDULED_AUTOMATIONS_JOB) {
      await this.scheduledEvaluator.evaluateAndEnqueue();
      return;
    }
    if (job.name === RECOVER_AI_AUTOMATIONS_JOB) {
      await this.movements?.recoverAndExecute();
      await this.aiScheduler.recoverAndEnqueue();
      // E-mail do kit ao cliente (flow-signed-kit-sprints.md, S4): mesma passada de 1 minuto.
      await this.kitEmails?.sendDue();
      return;
    }
    if (job.name === PROCESS_AI_AUTOMATION_JOB) {
      const data = job.data as { databaseRef: string; outboxId: string };
      await this.aiProcessor.process(data.databaseRef, data.outboxId);
      return;
    }
    if (job.name === PROCESS_EMAIL_DISPATCH_JOB) {
      const data = job.data as { databaseRef: string; dispatchId: string };
      await this.processDispatch(data.databaseRef, data.dispatchId);
      return;
    }
    if (job.name === RECOVER_EMAIL_DISPATCHES_JOB) {
      await this.emailScheduler.recoverAndEnqueue();
      return;
    }
    if (job.name === SEND_EMAIL_NOTIFICATION_JOB || job.name === SEND_SCHEDULED_EMAIL_NOTIFICATION_JOB) {
      await this.processLegacy(job.data as AutomationJobPayload);
      return;
    }
    // Job name desconhecido (ex.: fila compartilhada no futuro): ignora silenciosamente, nunca
    // trava o worker.
  }

  private async processLegacy(payload: AutomationJobPayload): Promise<void> {
    const ids =
      'dispatchDate' in payload && payload.dispatchDate
        ? await this.dispatchLog.recordScheduled(payload.databaseRef, payload.clientId, payload.dispatchDate, [
            { automationRuleId: payload.automationRuleId, cardId: payload.cardId, boardColumnId: payload.boardColumnId }
          ])
        : await this.dispatchLog.recordForActivity(
            payload.databaseRef,
            payload.clientId,
            (payload as SendEmailNotificationJobPayload).sourceActivityId
          );
    for (const id of ids) {
      await this.processDispatch(payload.databaseRef, id);
    }
  }

  /**
   * Retoma a linha (pendente vencida ou processamento parado), envia a quem ainda
   * nao recebeu e registra cada destinatario. Retorna null se outra execucao ja
   * levou a linha ou ela nao esta vencida.
   */
  async processDispatch(databaseRef: string, dispatchId: string): Promise<EmailDispatchOutcome | null> {
    const row = await this.dispatchLog.claim(databaseRef, dispatchId);
    if (!row) {
      return null;
    }
    const outcome = await this.deliver(databaseRef, row);
    this.metrics.record(outcome);
    return outcome;
  }

  private async deliver(databaseRef: string, row: ClaimedDispatch): Promise<EmailDispatchOutcome> {
    if (!row.boardId) {
      await this.dispatchLog.markSkipped(databaseRef, row.id, 'card_missing');
      return 'skipped';
    }
    if (!row.ruleActive || !row.triggerType || !row.recipientRole) {
      await this.dispatchLog.markSkipped(databaseRef, row.id, 'rule_inactive');
      return 'skipped';
    }
    const payload = toPayload(databaseRef, row);

    try {
      const recipients = await this.resolveRecipients(payload);
      const alreadySent = new Set(await this.dispatchLog.sentRecipients(databaseRef, row.clientId, row.id));
      const pending = recipients.filter(
        (recipient): recipient is IdentityContact & { email: string } =>
          Boolean(recipient.email) && !alreadySent.has(recipient.identityId)
      );

      if (pending.length === 0) {
        // Sem destinatario resolvivel (ex.: assignee sem responsavel atribuido no momento) ou
        // todos ja receberam numa tentativa anterior: nao e erro.
        await this.dispatchLog.markSent(databaseRef, row.id);
        return 'sent';
      }

      const emailContent = await this.buildEmailContent(payload);
      if (!emailContent) {
        // Card ou activity de origem nao encontrado (ex.: card removido entre o evento e o
        // envio) — nada a enviar, nao e falha de provedor de e-mail.
        await this.dispatchLog.markSkipped(databaseRef, row.id, 'source_missing');
        return 'skipped';
      }

      const failures: unknown[] = [];
      await Promise.all(
        pending.map(async (recipient) => {
          try {
            await this.sendByKind(emailContent, recipient.email, recipient.displayName);
          } catch (error) {
            failures.push(error);
            return;
          }
          await this.dispatchLog.recordRecipientSent(databaseRef, row.clientId, row.id, recipient.identityId);
        })
      );
      if (failures.length > 0) {
        throw new Error(failures.map((failure) => sanitizeMailError(failure)).join('; '));
      }

      await this.dispatchLog.markSent(databaseRef, row.id);
      return 'sent';
    } catch (error) {
      const status = await this.dispatchLog.scheduleRetryOrFail(databaseRef, row.id, sanitizeMailError(error));
      this.logger.warn(`E-mail dispatch ${row.id} attempt ${row.attemptCount} failed (${status ?? 'unchanged'})`);
      return status === 'failed' ? 'failed' : 'retry_scheduled';
    }
  }

  private async sendByKind(content: EmailContent, to: string, recipientName: string | null): Promise<void> {
    switch (content.kind) {
      case 'column_moved':
        return this.mailer.sendColumnMovedNotification({ ...content, to, recipientName });
      case 'due_date_approaching':
        return this.mailer.sendDueDateApproachingNotification({ ...content, to, recipientName });
      case 'card_stale':
        return this.mailer.sendCardStaleNotification({ ...content, to, recipientName });
      case 'juridico_process_moved':
        return this.mailer.sendJuridicoProcessMovedNotification({ ...content, to, recipientName });
      case 'djen_publication_received':
        return this.mailer.sendDjenPublicationNotification({ ...content, to, recipientName });
    }
  }

  private async resolveRecipients(payload: AutomationJobPayload): Promise<IdentityContact[]> {
    let identityIds: string[] = [];

    if (payload.recipientRole === 'assignee') {
      const cardAssignees = await this.assignees.list(payload.databaseRef, payload.clientId, payload.cardId);
      identityIds = cardAssignees.map((assignee) => assignee.identityId);
    } else if (payload.recipientRole === 'creator') {
      const card = await this.cards.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.cardId);
      identityIds = card ? [card.createdByIdentityId] : [];
    } else if (payload.recipientRole === 'board_member') {
      identityIds = payload.actionConfig?.boardMemberIdentityId ? [payload.actionConfig.boardMemberIdentityId] : [];
    }

    // Sprint 3.5: e-mail so a quem VE o card no momento do envio; destinatario fixo de outro
    // escritorio e ignorado sem erro. Chave desligada: sem filtro (comportamento anterior).
    identityIds = await this.visibility.identitiesWhoSeeCard(
      payload.databaseRef,
      payload.clientId,
      payload.boardId,
      payload.cardId,
      identityIds
    );
    if (identityIds.length === 0) {
      return [];
    }
    return this.resolveIdentityContacts(identityIds);
  }

  // Identidades vivem em jboot_identity, dados do card em banco dedicado do Kanban — mesmo
  // padrao de segundo round-trip usado em members.repository.ts (resolveDisplayNames).
  private async resolveIdentityContacts(identityIds: string[]): Promise<IdentityContact[]> {
    const result = await this.database.queryIdentity<{ id: string; displayName: string | null; email: string | null }>(
      `SELECT id, display_name AS "displayName", email FROM identities WHERE id = ANY($1::uuid[])`,
      [identityIds]
    );
    return result.rows.map((row) => ({ identityId: row.id, displayName: row.displayName, email: row.email }));
  }

  private async buildEmailContent(payload: AutomationJobPayload): Promise<EmailContent | null> {
    switch (payload.triggerType) {
      case 'column_entered':
      case 'column_left':
        return this.buildColumnMovedEmailContent(payload as SendEmailNotificationJobPayload);
      case 'due_date_approaching':
        return this.buildDueDateApproachingEmailContent(payload as SendScheduledEmailNotificationJobPayload);
      case 'card_stale':
        return this.buildCardStaleEmailContent(payload as SendScheduledEmailNotificationJobPayload);
      case 'juridico_process_moved':
        return this.buildJuridicoProcessMovedEmailContent(payload as SendEmailNotificationJobPayload);
      case 'djen_publication_received':
        return this.buildDjenPublicationEmailContent(payload as SendEmailNotificationJobPayload);
      default:
        return null;
    }
  }

  private async buildColumnMovedEmailContent(payload: SendEmailNotificationJobPayload): Promise<EmailContent | null> {
    const [card, activity] = await Promise.all([
      this.cards.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.cardId),
      this.activities.findById(payload.databaseRef, payload.clientId, payload.cardId, payload.sourceActivityId)
    ]);
    if (!card || !activity) {
      return null;
    }

    // fromColumn/toColumn sao sempre derivados do event_payload do card.moved (nunca de
    // payload.boardColumnId, que e a coluna da REGRA — destino em column_entered, origem em
    // column_left; usar payload.boardColumnId aqui daria a coluna errada para column_left).
    const fromBoardColumnId = (activity.eventPayload?.fromBoardColumnId as string | undefined) ?? null;
    const toBoardColumnId = (activity.eventPayload?.toBoardColumnId as string | undefined) ?? payload.boardColumnId;
    const [fromColumn, toColumn, [mover]] = await Promise.all([
      fromBoardColumnId ? this.columns.findById(payload.databaseRef, payload.clientId, payload.boardId, fromBoardColumnId) : null,
      this.columns.findById(payload.databaseRef, payload.clientId, payload.boardId, toBoardColumnId),
      this.resolveIdentityContacts([activity.authorIdentityId])
    ]);

    return {
      kind: 'column_moved',
      cardTitle: card.title,
      fromColumnName: fromColumn?.name ?? 'N/A',
      toColumnName: toColumn?.name ?? 'N/A',
      movedByName: mover?.displayName ?? mover?.email ?? 'Usuario',
      movedAt: formatEventTime(activity.createdAt),
      direction: payload.triggerType === 'column_left' ? 'left' : 'entered'
    };
  }

  private async buildDueDateApproachingEmailContent(payload: SendScheduledEmailNotificationJobPayload): Promise<EmailContent | null> {
    const [card, column] = await Promise.all([
      this.cards.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.cardId),
      this.columns.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.boardColumnId)
    ]);
    if (!card || !card.dueDate) {
      return null;
    }
    return {
      kind: 'due_date_approaching',
      cardTitle: card.title,
      columnName: column?.name ?? 'N/A',
      dueDate: card.dueDate,
      daysBefore: payload.daysBefore ?? 0
    };
  }

  private async buildCardStaleEmailContent(payload: SendScheduledEmailNotificationJobPayload): Promise<EmailContent | null> {
    const [card, column] = await Promise.all([
      this.cards.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.cardId),
      this.columns.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.boardColumnId)
    ]);
    if (!card) {
      return null;
    }
    return {
      kind: 'card_stale',
      cardTitle: card.title,
      columnName: column?.name ?? 'N/A',
      daysStale: payload.daysStale ?? 0
    };
  }

  private async buildJuridicoProcessMovedEmailContent(payload: SendEmailNotificationJobPayload): Promise<EmailContent | null> {
    const [card, column, activity] = await Promise.all([
      this.cards.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.cardId),
      this.columns.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.boardColumnId),
      this.activities.findById(payload.databaseRef, payload.clientId, payload.cardId, payload.sourceActivityId)
    ]);
    if (!card || !activity) {
      return null;
    }
    const eventPayload = activity.eventPayload ?? {};
    return {
      kind: 'juridico_process_moved',
      cardTitle: card.title,
      columnName: column?.name ?? 'N/A',
      numeroProcesso: String(eventPayload.numeroProcesso ?? ''),
      tribunal: String(eventPayload.tribunal ?? ''),
      novasMovimentacoes: (eventPayload.novasMovimentacoes as Array<{ occurredAt: string | null; description: string }>) ?? []
    };
  }

  private async buildDjenPublicationEmailContent(payload: SendEmailNotificationJobPayload): Promise<EmailContent | null> {
    const [card, column, activity] = await Promise.all([
      this.cards.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.cardId),
      this.columns.findById(payload.databaseRef, payload.clientId, payload.boardId, payload.boardColumnId),
      this.activities.findById(payload.databaseRef, payload.clientId, payload.cardId, payload.sourceActivityId)
    ]);
    if (!card || !activity) {
      return null;
    }
    const eventPayload = activity.eventPayload ?? {};
    const publication = (eventPayload.publicacao ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);
    return {
      kind: 'djen_publication_received',
      cardTitle: card.title,
      columnName: column?.name ?? 'N/A',
      numeroProcesso: String(eventPayload.numeroProcesso ?? ''),
      tipoComunicacao: text(publication.tipoComunicacao),
      tipoDocumento: text(publication.tipoDocumento),
      orgao: text(publication.orgao),
      dataDisponibilizacao: text(publication.dataDisponibilizacao),
      trecho: text(publication.trecho) ?? ''
    };
  }
}

/** Linha do outbox no formato que os montadores de conteudo ja usam. */
function toPayload(databaseRef: string, row: ClaimedDispatch): AutomationJobPayload {
  const base = {
    databaseRef,
    clientId: row.clientId,
    boardId: row.boardId!,
    boardColumnId: row.boardColumnId,
    cardId: row.cardId,
    automationRuleId: row.automationRuleId,
    triggerType: row.triggerType!,
    recipientRole: row.recipientRole!,
    actionConfig: row.actionConfig ?? {}
  };
  if (row.dispatchDate) {
    return {
      ...base,
      dispatchDate: row.dispatchDate,
      daysBefore: row.triggerConfig?.daysBefore,
      daysStale: row.triggerConfig?.daysStale
    } satisfies SendScheduledEmailNotificationJobPayload;
  }
  return { ...base, sourceActivityId: row.sourceActivityId! } satisfies SendEmailNotificationJobPayload;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Erro do SMTP sem endereco de e-mail, em uma linha e truncado (vai para o banco e para a tela). */
export function sanitizeMailError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(EMAIL_PATTERN, '[e-mail]').replace(/\s+/g, ' ').trim().slice(0, 200) || 'mail_error';
}

/**
 * Data/hora do evento para o e-mail. O driver `pg` devolve `timestamptz` como `Date`
 * (o tipo do repositorio diz string); sem converter, o template quebrava e nenhum
 * e-mail de entrada/saida de coluna saia.
 */
export function formatEventTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
}
