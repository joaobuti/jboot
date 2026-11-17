import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { OfficeKitAnalysis } from './office-kit-docx';

export type ServiceContractFormat = 'html' | 'docx';

/** Analise gravada com a versao `.docx` (sem as tags, que ficam na coluna propria). */
export type StoredKitAnalysis = Omit<OfficeKitAnalysis, 'tags'>;

export interface ServiceContractVersionRow {
  id: string;
  version: number;
  format: ServiceContractFormat;
  /** So nas versoes HTML do editor Quill (Sprint 1, historico). */
  contentHtml: string | null;
  storageKey: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  analysis: StoredKitAnalysis | null;
  tags: string[];
  contentSha256: string;
  createdByIdentityId: string;
  createdAt: string;
}

export type ServiceContractVersionSummary = Omit<ServiceContractVersionRow, 'contentHtml' | 'contentSha256' | 'analysis' | 'storageKey'>;

const SUMMARY = `id, version, format, file_name AS "fileName", size_bytes AS "sizeBytes", tags,
  created_by_identity_id AS "createdByIdentityId", created_at AS "createdAt"`;
const FULL = `${SUMMARY}, content_html AS "contentHtml", storage_key AS "storageKey", analysis,
  content_sha256 AS "contentSha256"`;

/** Versoes imutaveis do contrato de servicos do escritorio; a atual e a de maior numero. */
@Injectable()
export class ServiceContractRepository {
  constructor(private readonly database: DatabaseService) {}

  async current(databaseRef: string, clientId: string, officeId: string): Promise<ServiceContractVersionRow | null> {
    const result = await this.database.queryForDatabaseRef<ServiceContractVersionRow>(
      databaseRef,
      `SELECT ${FULL} FROM kanban_office_service_contract_versions
       WHERE client_id = $1 AND office_id = $2 ORDER BY version DESC LIMIT 1`,
      [clientId, officeId]
    );
    return result.rows[0] ?? null;
  }

  async findVersion(databaseRef: string, clientId: string, officeId: string, version: number): Promise<ServiceContractVersionRow | null> {
    const result = await this.database.queryForDatabaseRef<ServiceContractVersionRow>(
      databaseRef,
      `SELECT ${FULL} FROM kanban_office_service_contract_versions
       WHERE client_id = $1 AND office_id = $2 AND version = $3`,
      [clientId, officeId, version]
    );
    return result.rows[0] ?? null;
  }

  async listVersions(databaseRef: string, clientId: string, officeId: string): Promise<ServiceContractVersionSummary[]> {
    const result = await this.database.queryForDatabaseRef<ServiceContractVersionSummary>(
      databaseRef,
      `SELECT ${SUMMARY} FROM kanban_office_service_contract_versions
       WHERE client_id = $1 AND office_id = $2 ORDER BY version DESC LIMIT 100`,
      [clientId, officeId]
    );
    return result.rows;
  }

  /**
   * Grava o `.docx` como versao N+1 se o arquivo mudou; com o mesmo hash da atual devolve a atual
   * (`created: false`) e o chamador remove o objeto enviado. Lock consultivo por escritorio serializa
   * envios simultaneos.
   */
  async saveDocxIfChanged(
    databaseRef: string,
    clientId: string,
    officeId: string,
    input: {
      id: string;
      storageKey: string;
      fileName: string;
      sizeBytes: number;
      tags: string[];
      analysis: StoredKitAnalysis;
      contentSha256: string;
      identityId: string;
    }
  ): Promise<{ row: ServiceContractVersionRow; created: boolean }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('office_service_contract:' || $1 || ':' || $2))`, [clientId, officeId]);
      const latest = await tx.query<ServiceContractVersionRow>(
        `SELECT ${FULL} FROM kanban_office_service_contract_versions
         WHERE client_id = $1 AND office_id = $2 ORDER BY version DESC LIMIT 1`,
        [clientId, officeId]
      );
      const current = latest.rows[0];
      if (current && current.format === 'docx' && current.contentSha256 === input.contentSha256) {
        return { row: current, created: false };
      }
      const inserted = await tx.query<ServiceContractVersionRow>(
        `INSERT INTO kanban_office_service_contract_versions
           (id, client_id, office_id, version, format, storage_key, file_name, size_bytes, analysis, tags,
            content_sha256, created_by_identity_id)
         VALUES ($1, $2, $3, $4, 'docx', $5, $6, $7, $8::jsonb, $9, $10, $11)
         RETURNING ${FULL}`,
        [
          input.id,
          clientId,
          officeId,
          (current?.version ?? 0) + 1,
          input.storageKey,
          input.fileName,
          input.sizeBytes,
          JSON.stringify(input.analysis),
          input.tags,
          input.contentSha256,
          input.identityId
        ]
      );
      return { row: inserted.rows[0], created: true };
    });
  }
}
