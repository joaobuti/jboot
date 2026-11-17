import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface ClaudeConnectorSettingsRow {
  enabled: boolean;
  maskPersonalData: boolean;
  policyAcceptedAt: string | null;
  /** Leitura de documentos da ficha do cliente pelo Claude (ADR 017, aceite proprio). */
  allowCustomerDocuments: boolean;
  customerDocumentsAcceptedAt: string | null;
}

const COLUMNS = `enabled, mask_personal_data AS "maskPersonalData", policy_accepted_at AS "policyAcceptedAt",
  allow_customer_documents AS "allowCustomerDocuments", customer_documents_accepted_at AS "customerDocumentsAcceptedAt"`;

@Injectable()
export class ClaudeConnectorSettingsRepository {
  constructor(private readonly database: DatabaseService) {}

  async find(databaseRef: string, clientId: string): Promise<ClaudeConnectorSettingsRow | null> {
    const result = await this.database.queryForDatabaseRef<ClaudeConnectorSettingsRow>(
      databaseRef,
      `SELECT ${COLUMNS} FROM kanban_claude_connector_settings WHERE client_id = $1`,
      [clientId]
    );
    return result.rows[0] ?? null;
  }

  async upsert(
    databaseRef: string,
    clientId: string,
    input: {
      enabled: boolean;
      maskPersonalData: boolean;
      acceptPolicy: boolean;
      allowCustomerDocuments: boolean;
      acceptCustomerDocumentsPolicy: boolean;
      identityId: string;
    }
  ): Promise<ClaudeConnectorSettingsRow> {
    // O aceite e gravado uma vez e preservado; so o primeiro aceite registra quem/quando.
    const result = await this.database.queryForDatabaseRef<ClaudeConnectorSettingsRow>(
      databaseRef,
      `INSERT INTO kanban_claude_connector_settings
         (client_id, enabled, mask_personal_data, policy_accepted_at, policy_accepted_by_identity_id, updated_by_identity_id,
          allow_customer_documents, customer_documents_accepted_at, customer_documents_accepted_by_identity_id)
       VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN $5::uuid END, $5,
               $6, CASE WHEN $7 THEN now() END, CASE WHEN $7 THEN $5::uuid END)
       ON CONFLICT (client_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         mask_personal_data = EXCLUDED.mask_personal_data,
         policy_accepted_at = COALESCE(kanban_claude_connector_settings.policy_accepted_at, EXCLUDED.policy_accepted_at),
         policy_accepted_by_identity_id = COALESCE(kanban_claude_connector_settings.policy_accepted_by_identity_id, EXCLUDED.policy_accepted_by_identity_id),
         allow_customer_documents = EXCLUDED.allow_customer_documents,
         customer_documents_accepted_at = COALESCE(kanban_claude_connector_settings.customer_documents_accepted_at, EXCLUDED.customer_documents_accepted_at),
         customer_documents_accepted_by_identity_id = COALESCE(kanban_claude_connector_settings.customer_documents_accepted_by_identity_id, EXCLUDED.customer_documents_accepted_by_identity_id),
         updated_by_identity_id = EXCLUDED.updated_by_identity_id,
         updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        clientId, input.enabled, input.maskPersonalData, input.acceptPolicy, input.identityId,
        input.allowCustomerDocuments, input.acceptCustomerDocumentsPolicy
      ]
    );
    return result.rows[0];
  }
}
