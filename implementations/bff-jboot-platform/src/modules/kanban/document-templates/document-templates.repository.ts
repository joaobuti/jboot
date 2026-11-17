import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { TemplateValueType } from './template-variable-catalog';

export type TemplateVersionStatus = 'valid' | 'invalid_variables';

export interface DocumentTemplateRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersionRow {
  id: string;
  templateId: string;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  catalogVersion: number;
  validationStatus: TemplateVersionStatus;
  validationReport: Record<string, unknown>;
  uploadedByIdentityId: string;
  createdAt: string;
}

/** Versao com a chave do objeto (uso interno: download e geracao; nunca vai para a API). */
export interface TemplateVersionStorageRow extends TemplateVersionRow {
  storageBucket: string;
  storageKey: string;
}

export interface DocumentTemplateListRow extends DocumentTemplateRow {
  currentVersion: Pick<TemplateVersionRow, 'id' | 'version' | 'validationStatus' | 'createdAt'> | null;
  caseTypeCount: number;
}

export interface TemplateVariableRow {
  key: string;
  known: boolean;
  valueType: TemplateValueType | null;
  required: boolean;
  requiredUpdatedAt: string | null;
}

export interface NewTemplateVersion {
  versionId: string;
  templateId: string;
  storageBucket: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  catalogVersion: number;
  status: TemplateVersionStatus;
  report: Record<string, unknown>;
  variables: Array<{ key: string; known: boolean; valueType: TemplateValueType | null }>;
  identityId: string;
}

/** Estado bruto para a geracao (S6): tipo de caso, modelo escolhido e versao atual. */
export interface GenerationCandidateRow {
  caseTypeId: string;
  caseTypeName: string;
  caseTypeActive: boolean;
  defaultTemplateId: string | null;
  linkedTemplateIds: string[];
  template: (DocumentTemplateRow & { currentVersion: TemplateVersionStorageRow | null }) | null;
}

const TEMPLATE_SELECT = `t.id, t.name, t.description, t.active, t.current_version_id AS "currentVersionId",
  t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

const VERSION_SELECT = `v.id, v.template_id AS "templateId", v.version, v.file_name AS "fileName",
  v.content_type AS "contentType", v.size_bytes::text AS "sizeBytes", v.sha256, v.catalog_version AS "catalogVersion",
  v.validation_status AS "validationStatus", v.validation_report AS "validationReport",
  v.uploaded_by_identity_id AS "uploadedByIdentityId", v.created_at AS "createdAt"`;

const TEMPLATE_NAME_TAKEN = { code: 'template_name_taken', message: 'An active template with this name already exists' } as const;
export const TEMPLATE_NOT_FOUND = { code: 'template_not_found', message: 'Document template not found' } as const;
export const TEMPLATE_VERSION_NOT_FOUND = { code: 'template_version_not_found', message: 'Template version not found' } as const;

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

type RawVersion = Omit<TemplateVersionRow, 'sizeBytes'> & { sizeBytes: string };

function toVersion<T extends RawVersion>(row: T): Omit<T, 'sizeBytes'> & { sizeBytes: number } {
  return { ...row, sizeBytes: Number(row.sizeBytes) };
}

/**
 * Modelos de documento do tenant (CRM de leads, Sprint 5): `kanban_document_templates`,
 * `kanban_document_template_versions` (imutavel, garantido por trigger) e
 * `kanban_template_version_variables`. Configuracao do tenant, nao conteudo de
 * card: nao passa pelo `CardVisibilityService`.
 */
@Injectable()
export class DocumentTemplatesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string): Promise<DocumentTemplateListRow[]> {
    const result = await this.database.queryForDatabaseRef<
      DocumentTemplateRow & {
        versionId: string | null;
        versionNumber: number | null;
        versionStatus: TemplateVersionStatus | null;
        versionCreatedAt: string | null;
        caseTypeCount: string;
      }
    >(
      databaseRef,
      `SELECT ${TEMPLATE_SELECT},
              v.id AS "versionId", v.version AS "versionNumber", v.validation_status AS "versionStatus",
              v.created_at AS "versionCreatedAt",
              (SELECT count(*) FROM kanban_case_type_templates ct
                WHERE ct.client_id = t.client_id AND ct.template_id = t.id)::text AS "caseTypeCount"
       FROM kanban_document_templates t
       LEFT JOIN kanban_document_template_versions v ON v.client_id = t.client_id AND v.id = t.current_version_id
       WHERE t.client_id = $1
       ORDER BY t.active DESC, lower(t.name), t.id
       LIMIT 500`,
      [clientId]
    );
    return result.rows.map(({ versionId, versionNumber, versionStatus, versionCreatedAt, caseTypeCount, ...row }) => ({
      ...row,
      currentVersion:
        versionId && versionNumber !== null && versionStatus && versionCreatedAt
          ? { id: versionId, version: versionNumber, validationStatus: versionStatus, createdAt: versionCreatedAt }
          : null,
      caseTypeCount: Number(caseTypeCount)
    }));
  }

  /** Modelos do tenant por id (todos, ou so os informados). */
  async listByIds(databaseRef: string, clientId: string, templateIds: string[]): Promise<DocumentTemplateRow[]> {
    const result = await this.database.queryForDatabaseRef<DocumentTemplateRow>(
      databaseRef,
      `SELECT ${TEMPLATE_SELECT} FROM kanban_document_templates t
       WHERE t.client_id = $1 AND t.id = ANY($2::uuid[])
       ORDER BY lower(t.name), t.id
       LIMIT 500`,
      [clientId, templateIds]
    );
    return result.rows;
  }

  async findById(databaseRef: string, clientId: string, templateId: string): Promise<DocumentTemplateRow | null> {
    const result = await this.database.queryForDatabaseRef<DocumentTemplateRow>(
      databaseRef,
      `SELECT ${TEMPLATE_SELECT} FROM kanban_document_templates t WHERE t.client_id = $1 AND t.id = $2`,
      [clientId, templateId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    input: { name: string; description: string | null },
    identityId: string
  ): Promise<DocumentTemplateRow> {
    try {
      const result = await this.database.queryForDatabaseRef<DocumentTemplateRow>(
        databaseRef,
        `INSERT INTO kanban_document_templates AS t (client_id, name, description, created_by_identity_id)
         VALUES ($1, $2, $3, $4)
         RETURNING ${TEMPLATE_SELECT}`,
        [clientId, input.name, input.description, identityId]
      );
      return result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(TEMPLATE_NAME_TAKEN);
      }
      throw error;
    }
  }

  /** `description: null` limpa; `undefined` mantem. */
  async update(
    databaseRef: string,
    clientId: string,
    templateId: string,
    patch: { name?: string; description?: string | null; active?: boolean },
    identityId: string
  ): Promise<DocumentTemplateRow> {
    let result;
    try {
      result = await this.database.queryForDatabaseRef<DocumentTemplateRow>(
        databaseRef,
        `UPDATE kanban_document_templates AS t
         SET name = COALESCE($3, t.name),
             description = CASE WHEN $4::boolean THEN $5 ELSE t.description END,
             active = COALESCE($6, t.active),
             updated_by_identity_id = $7,
             updated_at = now()
         WHERE t.client_id = $1 AND t.id = $2
         RETURNING ${TEMPLATE_SELECT}`,
        [
          clientId,
          templateId,
          patch.name ?? null,
          patch.description !== undefined,
          patch.description ?? null,
          patch.active ?? null,
          identityId
        ]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(TEMPLATE_NAME_TAKEN);
      }
      throw error;
    }
    if (!result.rows[0]) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND);
    }
    return result.rows[0];
  }

  /** Tipos de caso que vinculam o modelo (e se ele e o padrao). */
  async listLinkedCaseTypes(
    databaseRef: string,
    clientId: string,
    templateId: string
  ): Promise<Array<{ id: string; name: string; active: boolean; isDefault: boolean }>> {
    const result = await this.database.queryForDatabaseRef<{ id: string; name: string; active: boolean; isDefault: boolean }>(
      databaseRef,
      `SELECT c.id, c.name, c.active, (c.default_template_id IS NOT DISTINCT FROM l.template_id) AS "isDefault"
       FROM kanban_case_type_templates l
       JOIN kanban_case_types c ON c.client_id = l.client_id AND c.id = l.case_type_id
       WHERE l.client_id = $1 AND l.template_id = $2
       ORDER BY c.active DESC, lower(c.name), c.id
       LIMIT 500`,
      [clientId, templateId]
    );
    return result.rows;
  }

  async listVersions(databaseRef: string, clientId: string, templateId: string): Promise<TemplateVersionRow[]> {
    const result = await this.database.queryForDatabaseRef<RawVersion>(
      databaseRef,
      `SELECT ${VERSION_SELECT} FROM kanban_document_template_versions v
       WHERE v.client_id = $1 AND v.template_id = $2
       ORDER BY v.version DESC
       LIMIT 100`,
      [clientId, templateId]
    );
    return result.rows.map(toVersion);
  }

  async findVersion(
    databaseRef: string,
    clientId: string,
    templateId: string,
    versionId: string
  ): Promise<TemplateVersionStorageRow | null> {
    const result = await this.database.queryForDatabaseRef<RawVersion & { storageBucket: string; storageKey: string }>(
      databaseRef,
      `SELECT ${VERSION_SELECT}, v.storage_bucket AS "storageBucket", v.storage_key AS "storageKey"
       FROM kanban_document_template_versions v
       WHERE v.client_id = $1 AND v.template_id = $2 AND v.id = $3`,
      [clientId, templateId, versionId]
    );
    return result.rows[0] ? toVersion(result.rows[0]) : null;
  }

  async listVariables(databaseRef: string, clientId: string, versionId: string): Promise<TemplateVariableRow[]> {
    const result = await this.database.queryForDatabaseRef<TemplateVariableRow>(
      databaseRef,
      `SELECT variable_key AS key, known, value_type AS "valueType", required, required_updated_at AS "requiredUpdatedAt"
       FROM kanban_template_version_variables
       WHERE client_id = $1 AND version_id = $2
       ORDER BY variable_key
       LIMIT 1000`,
      [clientId, versionId]
    );
    return result.rows;
  }

  /**
   * Grava a versao nova (numero sequencial por modelo, sob lock do modelo),
   * as variaveis detectadas (default obrigatoria) e aponta o modelo para ela.
   * O objeto ja foi enviado ao storage; falha aqui e compensada pelo servico.
   */
  async createVersion(databaseRef: string, clientId: string, input: NewTemplateVersion): Promise<TemplateVersionRow> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const locked = await tx.query(
        `SELECT id FROM kanban_document_templates WHERE client_id = $1 AND id = $2 FOR UPDATE`,
        [clientId, input.templateId]
      );
      if (!locked.rows[0]) {
        throw new NotFoundException(TEMPLATE_NOT_FOUND);
      }
      const inserted = await tx.query<RawVersion>(
        `INSERT INTO kanban_document_template_versions AS v
           (id, client_id, template_id, version, storage_bucket, storage_key, file_name, content_type, size_bytes,
            sha256, catalog_version, validation_status, validation_report, uploaded_by_identity_id)
         SELECT $1, $2, $3,
                COALESCE((SELECT max(version) FROM kanban_document_template_versions WHERE client_id = $2 AND template_id = $3), 0) + 1,
                $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13
         RETURNING ${VERSION_SELECT}`,
        [
          input.versionId,
          clientId,
          input.templateId,
          input.storageBucket,
          input.storageKey,
          input.fileName,
          input.contentType,
          input.sizeBytes,
          input.sha256,
          input.catalogVersion,
          input.status,
          JSON.stringify(input.report),
          input.identityId
        ]
      );
      if (input.variables.length > 0) {
        await tx.query(
          `INSERT INTO kanban_template_version_variables (client_id, version_id, variable_key, known, value_type)
           SELECT $1, $2, item.key, item.known, item.value_type
           FROM unnest($3::text[], $4::boolean[], $5::text[]) AS item(key, known, value_type)`,
          [
            clientId,
            input.versionId,
            input.variables.map((variable) => variable.key),
            input.variables.map((variable) => variable.known),
            input.variables.map((variable) => variable.valueType)
          ]
        );
      }
      await tx.query(
        `UPDATE kanban_document_templates
         SET current_version_id = $3, updated_by_identity_id = $4, updated_at = now()
         WHERE client_id = $1 AND id = $2`,
        [clientId, input.templateId, input.versionId, input.identityId]
      );
      return toVersion(inserted.rows[0]);
    });
  }

  /**
   * Marca variaveis da versao como obrigatorias/opcionais. Chave inexistente na
   * versao = 422 (nada muda). So `required` muda; o trigger recusa o resto.
   */
  async updateVariableRequirements(
    databaseRef: string,
    clientId: string,
    versionId: string,
    changes: Array<{ key: string; required: boolean }>,
    identityId: string
  ): Promise<{ changed: string[] }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const existing = await tx.query<{ key: string; required: boolean }>(
        `SELECT variable_key AS key, required FROM kanban_template_version_variables
         WHERE client_id = $1 AND version_id = $2 AND variable_key = ANY($3::text[])
         FOR UPDATE`,
        [clientId, versionId, changes.map((change) => change.key)]
      );
      const current = new Map(existing.rows.map((row) => [row.key, row.required]));
      const missing = changes.filter((change) => !current.has(change.key)).map((change) => change.key);
      if (missing.length > 0) {
        throw new UnprocessableEntityException({
          code: 'template_variable_not_found',
          message: 'Variable not detected in this template version',
          keys: missing
        });
      }
      const effective = changes.filter((change) => current.get(change.key) !== change.required);
      if (effective.length > 0) {
        await tx.query(
          `UPDATE kanban_template_version_variables AS v
           SET required = item.required, required_updated_by_identity_id = $3, required_updated_at = now()
           FROM unnest($4::text[], $5::boolean[]) AS item(key, required)
           WHERE v.client_id = $1 AND v.version_id = $2 AND v.variable_key = item.key`,
          [
            clientId,
            versionId,
            identityId,
            effective.map((change) => change.key),
            effective.map((change) => change.required)
          ]
        );
      }
      return { changed: effective.map((change) => change.key).sort() };
    });
  }

  /**
   * Leitura unica para a geracao (S6): tipo de caso, vinculos, modelo escolhido
   * (informado ou o padrao) e a versao ATUAL com a chave do objeto. As regras
   * (inativo, sem padrao, versao invalida) ficam em `resolveGenerationTemplate`.
   */
  async loadGenerationCandidate(
    databaseRef: string,
    clientId: string,
    caseTypeId: string,
    templateId: string | null
  ): Promise<GenerationCandidateRow | null> {
    const caseType = await this.database.queryForDatabaseRef<{
      caseTypeId: string;
      caseTypeName: string;
      caseTypeActive: boolean;
      defaultTemplateId: string | null;
      linkedTemplateIds: string[];
    }>(
      databaseRef,
      `SELECT c.id AS "caseTypeId", c.name AS "caseTypeName", c.active AS "caseTypeActive",
              c.default_template_id AS "defaultTemplateId",
              COALESCE((SELECT array_agg(l.template_id ORDER BY l.template_id) FROM kanban_case_type_templates l
                        WHERE l.client_id = c.client_id AND l.case_type_id = c.id), ARRAY[]::uuid[]) AS "linkedTemplateIds"
       FROM kanban_case_types c
       WHERE c.client_id = $1 AND c.id = $2`,
      [clientId, caseTypeId]
    );
    const row = caseType.rows[0];
    if (!row) {
      return null;
    }
    const chosen = templateId ?? row.defaultTemplateId;
    if (!chosen) {
      return { ...row, template: null };
    }
    const template = await this.findById(databaseRef, clientId, chosen);
    if (!template) {
      return { ...row, template: null };
    }
    const currentVersion = template.currentVersionId
      ? await this.findVersion(databaseRef, clientId, template.id, template.currentVersionId)
      : null;
    return { ...row, template: { ...template, currentVersion } };
  }
}
