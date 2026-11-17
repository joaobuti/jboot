import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../attachments/storage.service';
import { DOCX_CONTENT_TYPE } from '../document-templates/docx-package';
import { TemplateValidationRunner } from '../document-templates/template-validation-runner.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { ServiceContractRepository } from '../offices/service-contract/service-contract.repository';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { OfficeKitEmailService } from '../office-kit-email/office-kit-email.service';
import { CustomerValidationRepository, KitResult, ValidationRunRow } from './customer-validation.repository';

export interface KitOutcome {
  result: KitResult;
  kitId: string | null;
}

/** `KIT_<NOME>_<AAAA-MM-DD>.docx`, nome em maiusculas sem acento. */
export function kitFileName(customerName: string, generatedAt: string): string {
  const name = customerName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(generatedAt));
  return `KIT_${name || 'CLIENTE'}_${date}.docx`;
}

/**
 * Kit do escritorio gerado sozinho na confirmacao da validacao (Sprint 4; ADR 019, decisao 19).
 * Roda depois da confirmacao e fora da transacao dela: falha nao desfaz a confirmacao nem o card
 * de entrada e fica no run (`kit_result`). So parecer aprovado gera (Q2); modelo precisa ser `.docx`.
 * Valores: os revisados pela pessoa, senao os da IA. Tag sem valor fica `[[TAG]]` no arquivo (Q1).
 * O arquivo fica no storage do Flow (download no bloco Documentos do card, `CardOfficeKitService`) e vai ao
 * Drive (pasta do CPF) quando o Drive da empresa esta ativo.
 */
@Injectable()
export class OfficeKitGenerationService {
  private readonly logger = new Logger(OfficeKitGenerationService.name);

  constructor(
    private readonly validations: CustomerValidationRepository,
    private readonly serviceContracts: ServiceContractRepository,
    private readonly storage: StorageService,
    private readonly runner: TemplateValidationRunner,
    private readonly audit: KanbanAuditService,
    // S4 de flow-signed-kit-sprints.md: e-mail do kit ao cliente, quando ligado no escritorio.
    @Optional() private readonly kitEmails?: OfficeKitEmailService
  ) {}

  async generateForConfirmed(
    context: KanbanRequestContext,
    run: ValidationRunRow,
    customer: { name: string; documentNumber: string | null; email?: string | null },
    mutate: MutateContext
  ): Promise<KitOutcome> {
    let outcome: KitOutcome;
    try {
      outcome = await this.generate(context, run, customer, mutate);
    } catch (error) {
      this.logger.warn(`validation ${run.id}: office kit not generated (${error instanceof Error ? error.message : 'error'})`);
      outcome = { result: 'failed', kitId: null };
    }
    if (outcome.result !== 'generated') {
      await this.validations.setKitResult(context.databaseRef, context.clientId, run.id, outcome.result);
      await this.audit.record('kanban_customer_office_kit_not_generated', mutate, null, {
        customerId: run.customerId,
        runId: run.id,
        result: outcome.result
      });
    }
    return outcome;
  }

  private async generate(
    context: KanbanRequestContext,
    run: ValidationRunRow,
    customer: { name: string; documentNumber: string | null; email?: string | null },
    mutate: MutateContext
  ): Promise<KitOutcome> {
    if (run.verdict !== 'aprovado') return { result: 'not_approved', kitId: null };
    if (!run.contractOfficeId || run.contractVersion === null) return { result: 'no_model', kitId: null };
    const model = await this.serviceContracts.findVersion(context.databaseRef, context.clientId, run.contractOfficeId, run.contractVersion);
    if (!model) return { result: 'no_model', kitId: null };
    if (model.format !== 'docx' || !model.storageKey) return { result: 'model_not_docx', kitId: null };

    const values = run.review?.values ?? run.tagValues ?? {};
    const generatedAt = new Date().toISOString();
    const rendered = await this.runner.renderOfficeKit(await this.storage.download(model.storageKey), {
      values,
      gender: run.review ? run.review.gender : run.gender,
      waiverCourt: (run.review ? run.review.waiverCourt : run.waiverCourt) ?? 'jec',
      generatedAt
    });
    if (!rendered.ok) {
      this.logger.warn(`validation ${run.id}: office kit render failed code=${rendered.code}`);
      return { result: 'failed', kitId: null };
    }

    const warnings = [...rendered.report.warnings];
    const kitCpf = (values.CPF ?? '').replace(/\D/g, '');
    const customerCpf = (customer.documentNumber ?? '').replace(/\D/g, '');
    if (kitCpf && customerCpf && kitCpf !== customerCpf) {
      warnings.push({ code: 'cpf_differs_from_customer', detail: 'O CPF do kit e diferente do CPF da ficha.' });
    }
    const kitId = randomUUID();
    const file = Buffer.from(rendered.file);
    const storageKey = this.storage.buildCustomerKitStorageKey({ clientId: context.clientId, customerId: run.customerId, kitId });
    await this.storage.upload(storageKey, file, DOCX_CONTENT_TYPE);
    let driveQueued: boolean;
    try {
      ({ driveQueued } = await this.validations.saveKit(
        context.databaseRef,
        context.clientId,
        {
          id: kitId,
          customerId: run.customerId,
          runId: run.id,
          officeId: run.contractOfficeId,
          contractVersion: run.contractVersion,
          storageKey,
          fileName: kitFileName(customer.name, generatedAt),
          sizeBytes: file.length,
          sha256: rendered.sha256,
          report: { ...rendered.report, warnings }
        },
        context.identityId
      ));
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
    if (this.kitEmails) {
      // Falha na fila do e-mail nao desfaz o kit: ele continua no card para baixar.
      try {
        await this.kitEmails.enqueueForKit(context, { id: kitId, officeId: run.contractOfficeId, customerId: run.customerId }, { name: customer.name, email: customer.email ?? null }, mutate);
      } catch (error) {
        this.logger.warn(`validation ${run.id}: office kit email not queued (${error instanceof Error ? error.message : 'error'})`);
      }
    }
    await this.audit.record('kanban_customer_office_kit_generated', mutate, null, {
      customerId: run.customerId,
      runId: run.id,
      kitId,
      contractVersion: run.contractVersion,
      emptyTagCount: rendered.report.emptyTags.length,
      unresolvedMarkCount: rendered.report.unresolvedMarks.length,
      driveQueued,
      sha256: rendered.sha256
    });
    return { result: 'generated', kitId };
  }
}
