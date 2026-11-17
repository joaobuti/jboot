import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';
import { ColumnAutomationActionConfigDto, ColumnAutomationRecipientRole, ColumnAutomationTriggerType } from './dto/automation-rule.dto';

// BullMQ proibe ":" em nome de fila (usado internamente como separador de chave Redis) — a
// grafia "kanban:column-automation" do gate (docs/product/kanban-sprint-8-gate.md) e da
// documentacao e so o identificador conceitual da fila, nao um nome de fila BullMQ valido.
// Decisao de implementacao: usar hifen aqui, mantendo o mesmo identificador nos logs/docs.
export const KANBAN_AUTOMATION_QUEUE_NAME = 'kanban-column-automation';
export const SEND_EMAIL_NOTIFICATION_JOB = 'send-email-notification';
// Sprint 9: job diario (BullMQ repeatable job, nao @nestjs/schedule — ver Stack Fit Gate em
// docs/product/kanban-sprint-9-gate.md) que avalia due_date_approaching/card_stale e enfileira
// um SEND_SCHEDULED_EMAIL_NOTIFICATION_JOB por card/regra que bater a condicao.
export const EVALUATE_SCHEDULED_AUTOMATIONS_JOB = 'evaluate-scheduled-automations';
export const SEND_SCHEDULED_EMAIL_NOTIFICATION_JOB = 'send-scheduled-email-notification';
// Sprint 13: outbox de e-mail. O job leva so databaseRef + id da linha de
// kanban_automation_dispatch_log; retentativa e falha terminal ficam no banco.
export const PROCESS_EMAIL_DISPATCH_JOB = 'process-email-dispatch';
export const RECOVER_EMAIL_DISPATCHES_JOB = 'recover-email-dispatches';
export const RECOVER_EMAIL_DISPATCHES_REPEAT_JOB_ID = 'kanban-email-dispatches-every-minute';
export const PROCESS_AI_AUTOMATION_JOB = 'process-ai-automation';
export const RECOVER_AI_AUTOMATIONS_JOB = 'recover-ai-automations';
export const RECOVER_AI_AUTOMATIONS_REPEAT_JOB_ID = 'kanban-ai-automations-every-minute';
export const SCHEDULED_AUTOMATIONS_REPEAT_JOB_ID = 'kanban-scheduled-automations-daily';
// 06:00 America/Sao_Paulo, 1x/dia — ver "PE Decision — Scheduler" no gate da Sprint 9.
export const SCHEDULED_AUTOMATIONS_CRON_PATTERN = '0 6 * * *';
export const SCHEDULED_AUTOMATIONS_TIMEZONE = 'America/Sao_Paulo';

interface AutomationJobPayloadBase {
  // databaseRef nao faz parte da lista literal do gate (docs/product/kanban-sprint-8-gate.md),
  // mas e imprescindivel: o worker roda fora do request HTTP e precisa saber a qual banco
  // dedicado do tenant conectar (DatabaseService.queryForDatabaseRef exige databaseRef). Decisao
  // de implementacao registrada aqui por nao estar 100% explicita no gate.
  databaseRef: string;
  clientId: string;
  boardId: string;
  boardColumnId: string;
  cardId: string;
  automationRuleId: string;
  // Propagado no payload (em vez de round-trip extra automationRuleId -> regra) para o worker
  // montar o template certo em buildEmailContent. Decisao de implementacao, sem impacto de
  // contrato — ver "Worker" no gate da Sprint 9.
  triggerType: ColumnAutomationTriggerType;
  recipientRole: ColumnAutomationRecipientRole;
  actionConfig: ColumnAutomationActionConfigDto;
}

// Payloads legados (Sprints 8/9): o worker ainda aceita jobs ja enfileirados antes
// da Sprint 13 e os converte em linha do outbox; nada novo e publicado neste formato.
// Job reativo (Sprint 8: column_entered; Sprint 9: column_left, juridico_process_moved).
export interface SendEmailNotificationJobPayload extends AutomationJobPayloadBase {
  sourceActivityId: string;
}

// Job agendado (Sprint 9: due_date_approaching, card_stale), produzido pela avaliacao diaria.
export interface SendScheduledEmailNotificationJobPayload extends AutomationJobPayloadBase {
  // Data corrente do job (YYYY-MM-DD), usada pelo worker como chave de idempotencia por dia em
  // vez de sourceActivityId. Ver "PE Decision — Idempotencia por dia" no gate da Sprint 9.
  dispatchDate: string;
  daysBefore?: number;
  daysStale?: number;
}

export type AutomationJobPayload = SendEmailNotificationJobPayload | SendScheduledEmailNotificationJobPayload;

@Injectable()
export class AutomationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationQueueService.name);
  private readonly queue: Queue;

  constructor(private readonly config: AppConfigService) {
    this.queue = new Queue(KANBAN_AUTOMATION_QUEUE_NAME, {
      connection: { url: this.config.redisUrl } as never
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDailyEvaluationSchedule();
    await this.ensureAiRecoverySchedule();
    await this.ensureEmailRecoverySchedule();
  }

  private async ensureEmailRecoverySchedule(): Promise<void> {
    try {
      await this.queue.add(
        RECOVER_EMAIL_DISPATCHES_JOB,
        {},
        {
          jobId: RECOVER_EMAIL_DISPATCHES_REPEAT_JOB_ID,
          repeat: { pattern: '*/1 * * * *', tz: SCHEDULED_AUTOMATIONS_TIMEZONE },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to register e-mail dispatch recovery job: ${(error as Error).message}`);
    }
  }

  private async ensureAiRecoverySchedule(): Promise<void> {
    try {
      await this.queue.add(
        RECOVER_AI_AUTOMATIONS_JOB,
        {},
        {
          jobId: RECOVER_AI_AUTOMATIONS_REPEAT_JOB_ID,
          repeat: { pattern: '*/1 * * * *', tz: SCHEDULED_AUTOMATIONS_TIMEZONE },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to register AI automation recovery job: ${(error as Error).message}`);
    }
  }

  /**
   * Registra o repeatable job diario. `queue.add` com `repeat` e idempotente por
   * nome+padrao+jobId no Redis/Valkey: chamar isto de N instancias do platform-api no boot
   * produz um unico agendamento, sem lock distribuido adicional — esse dedup nativo do BullMQ e
   * exatamente o motivo da escolha de scheduler (ver Stack Fit Gate no gate da Sprint 9).
   */
  private async ensureDailyEvaluationSchedule(): Promise<void> {
    try {
      await this.queue.add(
        EVALUATE_SCHEDULED_AUTOMATIONS_JOB,
        {},
        {
          jobId: SCHEDULED_AUTOMATIONS_REPEAT_JOB_ID,
          repeat: { pattern: SCHEDULED_AUTOMATIONS_CRON_PATTERN, tz: SCHEDULED_AUTOMATIONS_TIMEZONE },
          // Avaliacao idempotente (UNIQUE por dia): repetir apos falha nao duplica envio.
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: true,
          removeOnFail: 1000
        }
      );
    } catch (error) {
      this.logger.error(`Failed to register daily scheduled-automations repeatable job: ${(error as Error).message}`);
    }
  }

  /**
   * Publica o id de uma linha ja gravada no outbox. Fire-and-forget: Valkey
   * indisponivel so atrasa o envio (a varredura de 1 minuto republica), nunca
   * bloqueia nem reverte a movimentacao do card. Sem retentativa no BullMQ e sem
   * guardar job falho: o estado e do banco, e jobId repetido seria ignorado
   * enquanto o job antigo existisse.
   */
  async enqueueEmailDispatch(databaseRef: string, dispatchId: string): Promise<void> {
    try {
      await this.queue.add(
        PROCESS_EMAIL_DISPATCH_JOB,
        { databaseRef, dispatchId },
        { jobId: `email-${dispatchId}`, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue e-mail dispatch ${dispatchId}: ${(error as Error).message}`);
    }
  }

  async enqueueAiOutbox(databaseRef: string, outboxId: string): Promise<void> {
    try {
      await this.queue.add(
        PROCESS_AI_AUTOMATION_JOB,
        { databaseRef, outboxId },
        {
          jobId: `ai-${outboxId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue AI automation outbox ${outboxId}: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
