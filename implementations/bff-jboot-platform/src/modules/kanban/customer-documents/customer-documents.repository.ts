import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { CustomerDocumentRequirements, CustomerDocumentType, DEFAULT_DOCUMENT_REQUIREMENTS, LATE_DOCUMENT_TYPES } from './customer-document-catalog';

export interface CustomerDocumentRow {
  id: string;
  customerId: string;
  documentType: CustomerDocumentType;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  uploadedByIdentityId: string;
  createdAt: string;
}

export interface CreateCustomerDocumentInput {
  id: string;
  customerId: string;
  documentType: CustomerDocumentType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageBucket: string;
  storageKey: string;
  identityId: string;
}

const SELECT = `id, customer_id AS "customerId", document_type AS "documentType", version,
                file_name AS "fileName", content_type AS "contentType", size_bytes AS "sizeBytes",
                sha256, storage_key AS "storageKey", uploaded_by_identity_id AS "uploadedByIdentityId",
                created_at AS "createdAt"`;

const PROFILE_SELECT = `residence_proof_third_party AS "residenceProofThirdParty", cpf_on_identity AS "cpfOnIdentity"`;

@Injectable()
export class CustomerDocumentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async listCurrent(ref: string, clientId: string, customerId: string): Promise<CustomerDocumentRow[]> {
    const result = await this.db.queryForDatabaseRef<CustomerDocumentRow>(
      ref,
      `SELECT ${SELECT} FROM kanban_customer_documents
       WHERE client_id = $1 AND customer_id = $2 AND superseded_at IS NULL AND removed_at IS NULL
       ORDER BY document_type`,
      [clientId, customerId]
    );
    return result.rows.map(normalize);
  }

  /** Versoes correntes de uma pagina de clientes (alertas da listagem). */
  async listCurrentForCustomers(ref: string, clientId: string, customerIds: string[]): Promise<CustomerDocumentRow[]> {
    if (customerIds.length === 0) return [];
    const result = await this.db.queryForDatabaseRef<CustomerDocumentRow>(
      ref,
      `SELECT ${SELECT} FROM kanban_customer_documents
       WHERE client_id = $1 AND customer_id = ANY($2::uuid[]) AND superseded_at IS NULL AND removed_at IS NULL`,
      [clientId, customerIds]
    );
    return result.rows.map(normalize);
  }

  async profilesForCustomers(ref: string, clientId: string, customerIds: string[]): Promise<Map<string, CustomerDocumentRequirements>> {
    if (customerIds.length === 0) return new Map();
    const result = await this.db.queryForDatabaseRef<CustomerDocumentRequirements & { customerId: string }>(
      ref,
      `SELECT customer_id AS "customerId", ${PROFILE_SELECT} FROM kanban_customer_document_profiles
       WHERE client_id = $1 AND customer_id = ANY($2::uuid[])`,
      [clientId, customerIds]
    );
    return new Map(
      result.rows.map((row) => [row.customerId, { residenceProofThirdParty: row.residenceProofThirdParty, cpfOnIdentity: row.cpfOnIdentity }])
    );
  }

  /** Qualquer versao do cliente (historico); download exige pertencer ao mesmo cliente. */
  async findById(ref: string, clientId: string, customerId: string, documentId: string): Promise<CustomerDocumentRow | null> {
    const result = await this.db.queryForDatabaseRef<CustomerDocumentRow>(
      ref,
      `SELECT ${SELECT} FROM kanban_customer_documents WHERE client_id = $1 AND customer_id = $2 AND id = $3`,
      [clientId, customerId, documentId]
    );
    return result.rows[0] ? normalize(result.rows[0]) : null;
  }

  /**
   * Nova versao do tipo: substitui a corrente na mesma transacao. O lock
   * consultivo serializa envios concorrentes do mesmo tipo e cliente, evitando
   * duas "versao 1" ou duas correntes.
   */
  async createVersion(ref: string, clientId: string, input: CreateCustomerDocumentInput): Promise<CustomerDocumentRow> {
    return this.db.transactionForDatabaseRef(ref, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `kanban_customer_documents:${clientId}:${input.customerId}:${input.documentType}`
      ]);
      const next = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS version FROM kanban_customer_documents
         WHERE client_id = $1 AND customer_id = $2 AND document_type = $3`,
        [clientId, input.customerId, input.documentType]
      );
      await client.query(
        `UPDATE kanban_customer_documents SET superseded_at = clock_timestamp()
         WHERE client_id = $1 AND customer_id = $2 AND document_type = $3
           AND superseded_at IS NULL AND removed_at IS NULL`,
        [clientId, input.customerId, input.documentType]
      );
      const inserted = await client.query<CustomerDocumentRow>(
        `INSERT INTO kanban_customer_documents
           (id, client_id, customer_id, document_type, version, file_name, content_type, size_bytes,
            sha256, storage_bucket, storage_key, uploaded_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${SELECT}`,
        [
          input.id,
          clientId,
          input.customerId,
          input.documentType,
          Number(next.rows[0].version),
          input.fileName,
          input.contentType,
          input.sizeBytes,
          input.sha256,
          input.storageBucket,
          input.storageKey,
          input.identityId
        ]
      );
      // HISCON enviado depois da validacao confirmada (sem HISCON nela): vale como os validados e vai ao
      // Drive da mesma forma (docs/product/flow-customer-promobank-sprints.md).
      if ((LATE_DOCUMENT_TYPES as readonly string[]).includes(input.documentType)) {
        await client.query(
          `INSERT INTO kanban_document_syncs
             (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
           SELECT $1, $2, $3, $4, 'pending', now(), 'customer_document', $5
           WHERE EXISTS (SELECT 1 FROM kanban_drive_configurations cfg WHERE cfg.client_id = $1 AND cfg.status = 'active')
             AND EXISTS (
               SELECT 1 FROM (
                 SELECT r.documents_snapshot FROM kanban_customer_validation_runs r
                 WHERE r.client_id = $1 AND r.customer_id = $5 AND r.confirmed_at IS NOT NULL
                 ORDER BY r.confirmed_at DESC LIMIT 1
               ) latest
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(latest.documents_snapshot) item WHERE item->>'type' = $6)
             )
           ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
          [clientId, input.id, Number(next.rows[0].version), input.sha256, input.customerId, input.documentType]
        );
      }
      return normalize(inserted.rows[0]);
    });
  }

  /** Remocao logica da versao corrente; o objeto e o historico ficam (retencao: ADR 015). */
  async removeCurrent(
    ref: string,
    clientId: string,
    customerId: string,
    documentType: CustomerDocumentType,
    identityId: string
  ): Promise<CustomerDocumentRow | null> {
    const result = await this.db.queryForDatabaseRef<CustomerDocumentRow>(
      ref,
      `UPDATE kanban_customer_documents
       SET removed_at = clock_timestamp(), removed_by_identity_id = $4
       WHERE client_id = $1 AND customer_id = $2 AND document_type = $3
         AND superseded_at IS NULL AND removed_at IS NULL
       RETURNING ${SELECT}`,
      [clientId, customerId, documentType, identityId]
    );
    return result.rows[0] ? normalize(result.rows[0]) : null;
  }

  async getProfile(ref: string, clientId: string, customerId: string): Promise<CustomerDocumentRequirements> {
    const result = await this.db.queryForDatabaseRef<CustomerDocumentRequirements>(
      ref,
      `SELECT ${PROFILE_SELECT} FROM kanban_customer_document_profiles WHERE client_id = $1 AND customer_id = $2`,
      [clientId, customerId]
    );
    return result.rows[0] ?? { ...DEFAULT_DOCUMENT_REQUIREMENTS };
  }

  /** Campo ausente no patch preserva o valor gravado (ou o padrao `false`). */
  async updateProfile(
    ref: string,
    clientId: string,
    customerId: string,
    patch: Partial<CustomerDocumentRequirements>,
    identityId: string
  ): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_customer_document_profiles
         (client_id, customer_id, residence_proof_third_party, cpf_on_identity, updated_by_identity_id)
       VALUES ($1, $2, COALESCE($3, false), COALESCE($4, false), $5)
       ON CONFLICT (client_id, customer_id) DO UPDATE
       SET residence_proof_third_party = COALESCE($3, kanban_customer_document_profiles.residence_proof_third_party),
           cpf_on_identity = COALESCE($4, kanban_customer_document_profiles.cpf_on_identity),
           updated_by_identity_id = EXCLUDED.updated_by_identity_id,
           updated_at = clock_timestamp()`,
      [clientId, customerId, patch.residenceProofThirdParty ?? null, patch.cpfOnIdentity ?? null, identityId]
    );
  }
}

function normalize(row: CustomerDocumentRow): CustomerDocumentRow {
  return { ...row, version: Number(row.version), sizeBytes: Number(row.sizeBytes) };
}
