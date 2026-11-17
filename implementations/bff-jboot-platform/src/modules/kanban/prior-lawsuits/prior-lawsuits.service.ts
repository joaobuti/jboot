import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { FlowCustomersService } from '../flow-customers/flow-customers.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { PriorLawsuitHistoryItemDto, PriorLawsuitsDto } from './dto/prior-lawsuits.dto';
import { normalizeBank, normalizeCnjNumber } from './prior-lawsuits.input';
import { PriorLawsuitDeclarationRow, PriorLawsuitRow, PriorLawsuitsRepository } from './prior-lawsuits.repository';

/**
 * Acoes ja ajuizadas pelo cliente (ADR 020, decisao do usuario 7; S2 de
 * docs/product/flow-initial-petitions-sprints.md). A rotina de peticoes tira da peca o banco ou o
 * contrato ja discutido; sem lista e sem a confirmacao "sem acoes anteriores", a execucao falha (S3).
 * Visibilidade igual a da ficha; auditoria sem banco nem numero do processo.
 */
@Injectable()
export class PriorLawsuitsService {
  constructor(
    private readonly repository: PriorLawsuitsRepository,
    private readonly customers: FlowCustomersService,
    private readonly audit: KanbanAuditService,
    private readonly database: DatabaseService
  ) {}

  async get(context: KanbanRequestContext, customerId: string, mutate: MutateContext): Promise<PriorLawsuitsDto> {
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    return this.load(context, customerId);
  }

  async add(context: KanbanRequestContext, customerId: string, input: { bank: string; processNumber: string }, mutate: MutateContext) {
    const bank = normalizeBank(input.bank);
    const processNumber = normalizeCnjNumber(input.processNumber);
    if (!bank) throw new UnprocessableEntityException({ code: 'prior_lawsuit_bank_required', message: 'Informe o banco.' });
    if (!processNumber) {
      throw new UnprocessableEntityException({
        code: 'prior_lawsuit_number_invalid',
        message: 'Numero do processo fora do padrao CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).'
      });
    }
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    const added = await this.repository.add(context.databaseRef, context.clientId, customerId, { bank, processNumber, identityId: context.identityId });
    if (!added) {
      throw new ConflictException({ code: 'prior_lawsuit_duplicate', message: 'Este processo ja esta na lista do cliente.' });
    }
    await this.audit.record('kanban_customer_prior_lawsuit_added', mutate, null, {
      customerId,
      lawsuitId: added.lawsuit.id,
      revokedDeclaration: added.revokedDeclaration
    });
    return this.load(context, customerId);
  }

  async remove(context: KanbanRequestContext, customerId: string, lawsuitId: string, mutate: MutateContext) {
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    const removed = await this.repository.remove(context.databaseRef, context.clientId, customerId, lawsuitId, context.identityId);
    if (!removed) throw new NotFoundException({ code: 'prior_lawsuit_not_found', message: 'Acao nao encontrada.' });
    await this.audit.record('kanban_customer_prior_lawsuit_removed', mutate, null, { customerId, lawsuitId });
    return this.load(context, customerId);
  }

  async declareNone(context: KanbanRequestContext, customerId: string, mutate: MutateContext) {
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    const result = await this.repository.declareNone(context.databaseRef, context.clientId, customerId, context.identityId);
    if (result.outcome === 'has_lawsuits') {
      throw new ConflictException({
        code: 'prior_lawsuits_listed',
        message: 'O cliente tem acoes na lista. Remova-as antes de confirmar que nao ha acoes anteriores.'
      });
    }
    if (result.created) await this.audit.record('kanban_customer_prior_lawsuits_declared_none', mutate, null, { customerId });
    return this.load(context, customerId);
  }

  async withdraw(context: KanbanRequestContext, customerId: string, mutate: MutateContext) {
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    const revoked = await this.repository.withdraw(context.databaseRef, context.clientId, customerId, context.identityId);
    if (revoked) await this.audit.record('kanban_customer_prior_lawsuits_declaration_withdrawn', mutate, null, { customerId });
    return this.load(context, customerId);
  }

  private async load(context: KanbanRequestContext, customerId: string): Promise<PriorLawsuitsDto> {
    const { lawsuits, declarations } = await this.repository.listForCustomer(context.databaseRef, context.clientId, customerId);
    const names = await this.identityNames([
      ...lawsuits.flatMap((row) => [row.createdByIdentityId, row.removedByIdentityId]),
      ...declarations.flatMap((row) => [row.declaredByIdentityId, row.revokedByIdentityId])
    ]);
    return buildPriorLawsuits(customerId, lawsuits, declarations, names);
  }

  // Identidades vivem em jboot_identity (mesmo padrao de service-contract.service.ts).
  private async identityNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const result = await this.database.queryIdentity<{ id: string; displayName: string | null }>(
      `SELECT id, display_name AS "displayName" FROM identities WHERE id = ANY($1::uuid[])`,
      [unique]
    );
    return new Map(result.rows.filter((row) => row.displayName).map((row) => [row.id, row.displayName as string]));
  }
}

/** Situacao, lista vigente e historico (mais recente primeiro) a partir das linhas gravadas. */
export function buildPriorLawsuits(
  customerId: string,
  lawsuits: PriorLawsuitRow[],
  declarations: PriorLawsuitDeclarationRow[],
  names: Map<string, string>
): PriorLawsuitsDto {
  const name = (id: string | null) => (id ? names.get(id) ?? null : null);
  const active = lawsuits.filter((row) => !row.removedAt);
  const current = declarations.find((row) => !row.revokedAt) ?? null;
  const history: PriorLawsuitHistoryItemDto[] = [
    ...lawsuits.flatMap((row) => [
      { kind: 'lawsuit_added' as const, at: row.createdAt, byName: name(row.createdByIdentityId), bank: row.bank, processNumber: row.processNumber },
      ...(row.removedAt
        ? [{ kind: 'lawsuit_removed' as const, at: row.removedAt, byName: name(row.removedByIdentityId), bank: row.bank, processNumber: row.processNumber }]
        : [])
    ]),
    ...declarations.flatMap((row) => [
      { kind: 'declared_none' as const, at: row.declaredAt, byName: name(row.declaredByIdentityId), origin: row.origin },
      ...(row.revokedAt && row.revokedReason
        ? [{ kind: 'declaration_revoked' as const, at: row.revokedAt, byName: name(row.revokedByIdentityId), reason: row.revokedReason }]
        : [])
    ])
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return {
    customerId,
    status: active.length > 0 ? 'listed' : current ? 'declared_none' : 'missing',
    lawsuits: active.map((row) => ({
      id: row.id,
      bank: row.bank,
      processNumber: row.processNumber,
      createdAt: row.createdAt,
      createdByName: name(row.createdByIdentityId)
    })),
    declaration: current
      ? { declaredAt: current.declaredAt, declaredByName: name(current.declaredByIdentityId), origin: current.origin }
      : null,
    history
  };
}
