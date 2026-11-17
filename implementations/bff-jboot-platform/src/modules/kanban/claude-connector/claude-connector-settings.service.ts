import { BadRequestException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { ClaudeConnectorSettingsRepository, ClaudeConnectorSettingsRow } from './claude-connector-settings.repository';
import { ClaudeConnectorSettingsView, ClaudeConnectorSettingsWriteDto } from './dto/claude-connector-settings.dto';

const DEFAULT_SETTINGS: ClaudeConnectorSettingsRow = {
  enabled: false,
  maskPersonalData: true,
  policyAcceptedAt: null,
  allowCustomerDocuments: false,
  customerDocumentsAcceptedAt: null
};

@Injectable()
export class ClaudeConnectorSettingsService {
  constructor(
    private readonly repository: ClaudeConnectorSettingsRepository,
    private readonly config: AppConfigService,
    private readonly audit: KanbanAuditService
  ) {}

  /** Sem linha gravada o conector esta desligado e mascara dados pessoais. */
  async resolve(context: Pick<KanbanRequestContext, 'databaseRef' | 'clientId'>): Promise<ClaudeConnectorSettingsRow> {
    return (await this.repository.find(context.databaseRef, context.clientId)) ?? DEFAULT_SETTINGS;
  }

  async get(context: KanbanRequestContext): Promise<ClaudeConnectorSettingsView> {
    return this.view(context, await this.resolve(context));
  }

  async put(context: KanbanRequestContext, dto: ClaudeConnectorSettingsWriteDto, mutate: MutateContext): Promise<ClaudeConnectorSettingsView> {
    const current = await this.resolve(context);
    const acceptPolicy = dto.acceptPolicy === true;
    if (dto.enabled && !current.policyAcceptedAt && !acceptPolicy) {
      throw new BadRequestException({ code: 'claude_connector_policy_required' });
    }
    const allowCustomerDocuments = dto.allowCustomerDocuments ?? current.allowCustomerDocuments;
    const acceptCustomerDocumentsPolicy = dto.acceptCustomerDocumentsPolicy === true;
    if (allowCustomerDocuments && !current.customerDocumentsAcceptedAt && !acceptCustomerDocumentsPolicy) {
      throw new BadRequestException({ code: 'claude_connector_documents_policy_required' });
    }
    const saved = await this.repository.upsert(context.databaseRef, context.clientId, {
      enabled: dto.enabled,
      maskPersonalData: dto.maskPersonalData,
      acceptPolicy,
      allowCustomerDocuments,
      acceptCustomerDocumentsPolicy,
      identityId: context.identityId
    });
    await this.audit.record('claude_connector.settings_updated', mutate, null, {
      enabled: saved.enabled,
      maskPersonalData: saved.maskPersonalData,
      policyAccepted: acceptPolicy,
      allowCustomerDocuments: saved.allowCustomerDocuments,
      customerDocumentsPolicyAccepted: acceptCustomerDocumentsPolicy
    });
    return this.view(context, saved);
  }

  private view(context: KanbanRequestContext, settings: ClaudeConnectorSettingsRow): ClaudeConnectorSettingsView {
    return {
      enabled: settings.enabled,
      maskPersonalData: settings.maskPersonalData,
      policyAcceptedAt: settings.policyAcceptedAt ? new Date(settings.policyAcceptedAt).toISOString() : null,
      allowCustomerDocuments: settings.allowCustomerDocuments,
      customerDocumentsAcceptedAt: settings.customerDocumentsAcceptedAt
        ? new Date(settings.customerDocumentsAcceptedAt).toISOString()
        : null,
      connectorUrl: this.config.flowConnectorResourceUrl,
      canManage: context.scopes.includes(FLOW_ADMIN_SCOPE)
    };
  }
}
