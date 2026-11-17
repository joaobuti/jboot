import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { DEFAULT_LEAD_REQUIRED_FIELDS, sortLeadFieldKeys } from './lead-fields';

export interface LeadRequiredFieldsRow {
  /** Chaves na ordem do catalogo. */
  requiredFields: string[];
  /** `false` = tenant nunca configurou (default P16). */
  configured: boolean;
  configuredAt: string | null;
  configuredByIdentityId: string | null;
}

/**
 * Campos obrigatorios para o envio do lead, por tenant (P16). Nao toca tabela
 * de card. Tenant sem configuracao usa `DEFAULT_LEAD_REQUIRED_FIELDS`.
 */
@Injectable()
export class LeadSettingsRepository {
  constructor(private readonly database: DatabaseService) {}

  async getRequiredFields(databaseRef: string, clientId: string): Promise<LeadRequiredFieldsRow> {
    const [settings, fields] = await Promise.all([
      this.database.queryForDatabaseRef<{ configuredAt: string | null; configuredBy: string | null }>(
        databaseRef,
        `SELECT lead_required_fields_configured_at AS "configuredAt", lead_required_fields_configured_by AS "configuredBy"
         FROM kanban_settings WHERE client_id = $1`,
        [clientId]
      ),
      this.database.queryForDatabaseRef<{ fieldKey: string }>(
        databaseRef,
        `SELECT field_key AS "fieldKey" FROM kanban_lead_required_fields WHERE client_id = $1`,
        [clientId]
      )
    ]);
    const configuredAt = settings.rows[0]?.configuredAt ?? null;
    if (!configuredAt) {
      return {
        requiredFields: [...DEFAULT_LEAD_REQUIRED_FIELDS],
        configured: false,
        configuredAt: null,
        configuredByIdentityId: null
      };
    }
    return {
      requiredFields: sortLeadFieldKeys(fields.rows.map((row) => row.fieldKey)),
      configured: true,
      configuredAt,
      configuredByIdentityId: settings.rows[0]?.configuredBy ?? null
    };
  }

  /** Substitui o conjunto (chaves ja validadas contra a whitelist pelo servico) e marca o tenant como configurado. */
  async replaceRequiredFields(databaseRef: string, clientId: string, keys: string[], identityId: string): Promise<void> {
    await this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await tx.query(`DELETE FROM kanban_lead_required_fields WHERE client_id = $1`, [clientId]);
      for (const key of keys) {
        await tx.query(
          `INSERT INTO kanban_lead_required_fields (client_id, field_key, created_by_identity_id) VALUES ($1, $2, $3)`,
          [clientId, key, identityId]
        );
      }
      await tx.query(
        `INSERT INTO kanban_settings (client_id, lead_required_fields_configured_at, lead_required_fields_configured_by, updated_by_identity_id, updated_at)
         VALUES ($1, clock_timestamp(), $2, $2, now())
         ON CONFLICT (client_id) DO UPDATE
           SET lead_required_fields_configured_at = EXCLUDED.lead_required_fields_configured_at,
               lead_required_fields_configured_by = EXCLUDED.lead_required_fields_configured_by,
               updated_by_identity_id = EXCLUDED.updated_by_identity_id,
               updated_at = now()`,
        [clientId, identityId]
      );
    });
  }
}
