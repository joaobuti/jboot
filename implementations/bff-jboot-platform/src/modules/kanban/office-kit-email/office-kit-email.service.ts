import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { StorageService } from '../attachments/storage.service';
import { MailerService } from '../automation/mailer.service';
import { ScheduledAutomationRepository } from '../automation/scheduled-automation.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { OfficesRepository } from '../offices/offices.repository';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { KitEmailRow, OfficeKitEmailRepository } from './office-kit-email.repository';

export const DEFAULT_KIT_EMAIL_SUBJECT = 'Documentos para assinatura';
export const DEFAULT_KIT_EMAIL_BODY = [
  'Olá, [[NOME]].',
  '',
  'Seguem em anexo os documentos do seu atendimento. Imprima, assine onde indicado e devolva ao escritório.',
  '',
  '[[ESCRITORIO]]'
].join('\n');

/** Ate quantos e-mails por empresa a cada passada do agendador (1 minuto). */
const SENDS_PER_TICK = 20;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Troca [[NOME]] e [[ESCRITORIO]]; o resto do texto e do escritorio, como foi salvo. */
export function renderKitEmail(template: string, values: { name: string; office: string }): string {
  return template.replace(/\[\[NOME\]\]/g, values.name).replace(/\[\[ESCRITORIO\]\]/g, values.office);
}

/**
 * E-mail do kit ao cliente (docs/product/flow-signed-kit-sprints.md, S4). Na geracao do kit, com o envio ligado no
 * escritorio e e-mail na ficha, entra na fila com assunto e texto ja montados. O agendador de automacoes envia com o
 * kit anexo, tenta de novo com espera crescente e registra no historico dos cards do cliente.
 */
@Injectable()
export class OfficeKitEmailService {
  private readonly logger = new Logger(OfficeKitEmailService.name);

  constructor(
    private readonly repository: OfficeKitEmailRepository,
    private readonly offices: OfficesRepository,
    private readonly storage: StorageService,
    private readonly mailer: MailerService,
    private readonly tenants: ScheduledAutomationRepository,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly activities: ActivitiesRepository,
    private readonly audit: KanbanAuditService
  ) {}

  async getSettings(context: KanbanRequestContext, officeId: string) {
    await this.requireOffice(context, officeId);
    const row = await this.repository.getSettings(context.databaseRef, context.clientId, officeId);
    return {
      officeId,
      enabled: row?.enabled ?? false,
      subject: row?.subject ?? DEFAULT_KIT_EMAIL_SUBJECT,
      body: row?.body ?? DEFAULT_KIT_EMAIL_BODY,
      updatedAt: row?.updatedAt ?? null
    };
  }

  async putSettings(context: KanbanRequestContext, officeId: string, input: { enabled: boolean; subject: string; body: string }, mutate: MutateContext) {
    await this.requireOffice(context, officeId);
    await this.repository.putSettings(context.databaseRef, context.clientId, officeId, input, context.identityId);
    await this.audit.record('kanban_office_kit_email_settings_updated', mutate, null, { officeId, enabled: input.enabled });
    return this.getSettings(context, officeId);
  }

  /** Chamado na geracao do kit; sem envio ligado ou sem e-mail valido, nao faz nada (o kit fica para baixar). */
  async enqueueForKit(
    context: KanbanRequestContext,
    kit: { id: string; officeId: string; customerId: string },
    customer: { name: string; email: string | null },
    mutate: MutateContext
  ): Promise<'queued' | 'disabled' | 'no_email'> {
    const settings = await this.repository.getSettings(context.databaseRef, context.clientId, kit.officeId);
    if (!settings?.enabled) return 'disabled';
    const email = customer.email?.trim() ?? '';
    if (!EMAIL.test(email)) return 'no_email';
    const office = await this.offices.findById(context.databaseRef, context.clientId, kit.officeId);
    const values = { name: customer.name, office: office?.name ?? '' };
    await this.repository.enqueue(context.databaseRef, context.clientId, {
      id: randomUUID(),
      customerId: kit.customerId,
      kitId: kit.id,
      toEmail: email,
      subject: renderKitEmail(settings.subject, values).slice(0, 200),
      body: renderKitEmail(settings.body, values),
      identityId: context.identityId
    });
    await this.audit.record('kanban_office_kit_email_queued', mutate, null, { customerId: kit.customerId, kitId: kit.id, officeId: kit.officeId });
    return 'queued';
  }

  async forKit(databaseRef: string, clientId: string, kitId: string): Promise<KitEmailRow | null> {
    return this.repository.forKit(databaseRef, clientId, kitId);
  }

  /** Passada do agendador: envia o que venceu em cada empresa ativa do Flow. */
  async sendDue(): Promise<void> {
    for (const tenant of await this.tenants.listActiveFlowTenants()) {
      try {
        for (let sent = 0; sent < SENDS_PER_TICK; sent += 1) {
          const row = await this.repository.claim(tenant.databaseRef, tenant.clientId);
          if (!row) break;
          await this.sendOne(tenant.databaseRef, tenant.clientId, row);
        }
      } catch (error) {
        this.logger.error(`office_kit_email_tick_failed client=${tenant.clientId}: ${(error as Error).message}`);
      }
    }
  }

  private async sendOne(databaseRef: string, clientId: string, row: KitEmailRow & { storageKey: string; fileName: string; leaseUntil: string }) {
    try {
      const content = await this.storage.download(row.storageKey);
      await this.mailer.sendOfficeKitEmail({ to: row.toEmail, subject: row.subject, text: row.body, attachment: { filename: row.fileName, content } });
    } catch (error) {
      const outcome = await this.repository.markFailed(databaseRef, clientId, row.id, row.leaseUntil, 'office_kit_email_failed');
      this.logger.warn(`office_kit_email_${outcome} client=${clientId} email=${row.id}: ${(error as Error).message}`);
      return;
    }
    if (!(await this.repository.markSent(databaseRef, clientId, row.id, row.leaseUntil))) return;
    const author = row.createdByIdentityId ?? '00000000-0000-0000-0000-000000000000';
    for (const cardId of await this.cardCustomers.cardIdsByCustomer(databaseRef, clientId, row.customerId)) {
      await this.activities.createSystemEvent(databaseRef, clientId, cardId, author, 'card.office_kit_emailed', { kitId: row.kitId }, `office-kit-emailed:${row.id}:${cardId}`);
    }
  }

  private async requireOffice(context: KanbanRequestContext, officeId: string) {
    const office = await this.offices.findById(context.databaseRef, context.clientId, officeId);
    if (!office) throw new NotFoundException({ code: 'office_not_found', message: 'Office not found' });
    return office;
  }
}
