import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { LeadSettingsResponse, UpdateLeadSettingsDto } from './dto/lead.dto';
import { DEFAULT_LEAD_REQUIRED_FIELDS, isLeadFieldKey, LEAD_FIELD_KEYS, sortLeadFieldKeys } from './lead-fields';
import { LeadSettingsRepository } from './lead-settings.repository';
import { LEAD_ADMIN_REQUIRED } from './leads.service';

/**
 * Campos cadastrais obrigatorios para o envio do lead, por tenant (P16).
 * Somente `flow:admin` (scope no controller + checagem aqui). Chave fora da
 * whitelist = 422 `invalid_lead_fields` com a lista, sem gravar nada.
 */
@Injectable()
export class LeadSettingsService {
  constructor(
    private readonly settings: LeadSettingsRepository,
    private readonly audit: KanbanAuditService
  ) {}

  async get(context: KanbanRequestContext): Promise<LeadSettingsResponse> {
    requireAdmin(context);
    return this.toResponse(context);
  }

  async update(context: KanbanRequestContext, dto: UpdateLeadSettingsDto, mutate: MutateContext): Promise<LeadSettingsResponse> {
    requireAdmin(context);
    const invalidFields = dto.requiredFields.filter((key) => !isLeadFieldKey(key));
    if (invalidFields.length > 0) {
      throw new UnprocessableEntityException({
        code: 'invalid_lead_fields',
        message: 'Unknown lead field keys',
        invalidFields
      });
    }
    const requiredFields = sortLeadFieldKeys(dto.requiredFields);
    await this.settings.replaceRequiredFields(context.databaseRef, context.clientId, requiredFields, context.identityId);
    await this.audit.record('kanban_lead_required_fields_updated', mutate, null, { requiredFields });
    return this.toResponse(context);
  }

  private async toResponse(context: KanbanRequestContext): Promise<LeadSettingsResponse> {
    const row = await this.settings.getRequiredFields(context.databaseRef, context.clientId);
    return {
      requiredFields: row.requiredFields,
      configured: row.configured,
      configuredAt: row.configuredAt,
      availableFields: [...LEAD_FIELD_KEYS],
      defaultRequiredFields: [...DEFAULT_LEAD_REQUIRED_FIELDS]
    };
  }
}

function requireAdmin(context: KanbanRequestContext): void {
  if (!context.scopes.includes(FLOW_ADMIN_SCOPE)) {
    throw new ForbiddenException(LEAD_ADMIN_REQUIRED);
  }
}
