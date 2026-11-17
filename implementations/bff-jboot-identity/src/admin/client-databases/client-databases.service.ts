import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { MutateContext } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { expectedDatabaseRef, isSupportedIsolation, refFollowsRule } from '../shared/database-ref-rule';
import { ClientDatabaseRow, ClientDatabasesRepository } from './client-databases.repository';

export interface ClientDatabaseView {
  clientId: string;
  clientName: string;
  applicationId: string;
  applicationSlug: string;
  applicationName: string;
  ruleStrategy: string | null;
  ruleSupported: boolean;
  current: ClientDatabaseRow['current'];
  followsRule: boolean;
  /** Pode refazer pela regra: diverge dela, a regra e suportada e nao ha dados em outro banco. */
  canApply: boolean;
  /** Por que nao pode aplicar, quando diverge. */
  blockedReason: 'rule_missing' | 'rule_not_supported' | 'data_in_other_database' | null;
}

/**
 * Banco de cada modulo contratado do cliente x regra atual do app; "Aplicar regra atual" refaz o
 * registro (docs/product/tenant-isolation-sprints.md, Sprint 0). So regras suportadas (compartilhado)
 * podem ser aplicadas: aplicar "dedicado" ou "schema" deixaria o cliente travado ou sem isolamento.
 */
@Injectable()
export class ClientDatabasesService {
  constructor(
    private readonly repository: ClientDatabasesRepository,
    private readonly audit: AdminAuditService,
    private readonly identityApplications: IdentityApplicationsCacheService
  ) {}

  async listForClient(clientId: string): Promise<ClientDatabaseView[]> {
    return (await this.repository.listForClient(clientId)).map((row) => toView(row));
  }

  /** Clientes do app cujo registro nao segue a regra atual. */
  async alignmentForApplication(applicationId: string): Promise<{ total: number; outdated: ClientDatabaseView[] }> {
    const views = (await this.repository.listForApplication(applicationId)).map((row) => toView(row));
    return { total: views.length, outdated: views.filter((view) => !view.followsRule) };
  }

  async applyForClient(clientId: string, applicationId: string, context: MutateContext): Promise<ClientDatabaseView> {
    const row = (await this.repository.listForClient(clientId)).find((item) => item.applicationId === applicationId);
    if (!row) throw new NotFoundException('Modulo nao contratado por este cliente');
    await this.apply(row, context);
    const updated = (await this.repository.listForClient(clientId)).find((item) => item.applicationId === applicationId);
    return toView(updated ?? row);
  }

  async applyForApplication(applicationId: string, context: MutateContext): Promise<{ applied: number; skipped: number }> {
    const rows = await this.repository.listForApplication(applicationId);
    let applied = 0;
    let skipped = 0;
    for (const row of rows) {
      const view = toView(row);
      if (view.followsRule) continue;
      if (!view.canApply) {
        skipped += 1;
        continue;
      }
      await this.apply(row, context);
      applied += 1;
    }
    return { applied, skipped };
  }

  private async apply(row: ClientDatabaseRow, context: MutateContext): Promise<void> {
    if (!row.rule) throw new BadRequestException({ code: 'application_rule_missing', message: 'O app nao tem regra de banco principal ativa.' });
    if (!isSupportedIsolation(row.rule.isolation_strategy)) {
      throw new BadRequestException({
        code: 'isolation_not_supported',
        message: 'A regra do app usa um isolamento ainda nao implementado; so "Database compartilhado" pode ser aplicado.'
      });
    }
    const view = toView(row);
    if (view.blockedReason === 'data_in_other_database') {
      throw new BadRequestException({
        code: 'client_data_in_other_database',
        message: 'O cliente esta ativo em outro banco, onde ficam os dados dele; trocar exige migrar os dados.'
      });
    }
    const expected = expectedDatabaseRef(row.rule, row.applicationId, row.clientId);
    const refId = await this.repository.applyExpected(row.clientId, row.applicationId, row.current?.id ?? null, expected);
    await this.identityApplications.invalidateClient(row.clientId);
    await this.audit.record('admin_client_database_rule_applied', context, {
      clientId: row.clientId,
      applicationId: row.applicationId,
      previous: row.current,
      databaseRefId: refId,
      strategy: expected?.strategy ?? 'none'
    });
  }
}

export function toView(row: ClientDatabaseRow): ClientDatabaseView {
  const expected = row.rule ? expectedDatabaseRef(row.rule, row.applicationId, row.clientId) : null;
  const followsRule = row.rule ? refFollowsRule(row.current, expected) : false;
  const ruleSupported = row.rule ? isSupportedIsolation(row.rule.isolation_strategy) : false;
  // Registro ativo em outro banco: os dados do cliente estao la; refazer pela regra os "esconderia".
  const dataElsewhere = Boolean(
    row.current && row.current.status === 'active' && expected && row.current.databaseName !== expected.databaseName
  );
  const blockedReason = followsRule
    ? null
    : !row.rule
      ? 'rule_missing'
      : !ruleSupported
        ? 'rule_not_supported'
        : dataElsewhere
          ? 'data_in_other_database'
          : null;
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    applicationId: row.applicationId,
    applicationSlug: row.applicationSlug,
    applicationName: row.applicationName,
    ruleStrategy: row.rule?.isolation_strategy ?? null,
    ruleSupported,
    current: row.current,
    followsRule,
    canApply: !followsRule && blockedReason === null,
    blockedReason
  };
}
