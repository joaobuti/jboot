import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';

export interface CaseTypeRow {
  id: string;
  name: string;
  description: string | null;
  classificationCriteria: string | null;
  expectedEvidence: string | null;
  defaultTemplateId: string | null;
  /** Modelos vinculados, ordenados por id. */
  templateIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTypeWrite {
  name: string;
  description: string | null;
  classificationCriteria: string | null;
  expectedEvidence: string | null;
  active: boolean;
  templateIds: string[];
  defaultTemplateId: string | null;
}

const CASE_TYPE_SELECT = `c.id, c.name, c.description, c.classification_criteria AS "classificationCriteria",
  c.expected_evidence AS "expectedEvidence", c.default_template_id AS "defaultTemplateId", c.active,
  COALESCE((SELECT array_agg(l.template_id ORDER BY l.template_id) FROM kanban_case_type_templates l
            WHERE l.client_id = c.client_id AND l.case_type_id = c.id), ARRAY[]::uuid[]) AS "templateIds",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;

const CASE_TYPE_NAME_TAKEN = { code: 'case_type_name_taken', message: 'An active case type with this name already exists' } as const;
export const CASE_TYPE_NOT_FOUND = { code: 'case_type_not_found', message: 'Case type not found' } as const;

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/**
 * Tipos de caso do tenant (CRM de leads, Sprint 5): `kanban_case_types` e o
 * vinculo N:N `kanban_case_type_templates`. O modelo padrao precisa estar entre
 * os vinculados (FK composta adiavel, conferida no fim de cada escrita).
 */
@Injectable()
export class CaseTypesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string): Promise<CaseTypeRow[]> {
    const result = await this.database.queryForDatabaseRef<CaseTypeRow>(
      databaseRef,
      `SELECT ${CASE_TYPE_SELECT} FROM kanban_case_types c
       WHERE c.client_id = $1
       ORDER BY c.active DESC, lower(c.name), c.id
       LIMIT 500`,
      [clientId]
    );
    return result.rows;
  }

  async findById(databaseRef: string, clientId: string, caseTypeId: string): Promise<CaseTypeRow | null> {
    const result = await this.database.queryForDatabaseRef<CaseTypeRow>(
      databaseRef,
      `SELECT ${CASE_TYPE_SELECT} FROM kanban_case_types c WHERE c.client_id = $1 AND c.id = $2`,
      [clientId, caseTypeId]
    );
    return result.rows[0] ?? null;
  }

  async create(databaseRef: string, clientId: string, input: CaseTypeWrite, identityId: string): Promise<CaseTypeRow> {
    try {
      return await this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
        await this.deferDefaultCheck(tx);
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO kanban_case_types
             (client_id, name, description, classification_criteria, expected_evidence, default_template_id, active,
              created_by_identity_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            clientId,
            input.name,
            input.description,
            input.classificationCriteria,
            input.expectedEvidence,
            input.defaultTemplateId,
            input.active,
            identityId
          ]
        );
        const caseTypeId = inserted.rows[0].id;
        await this.replaceLinks(tx, clientId, caseTypeId, input.templateIds, identityId);
        return this.finish(tx, clientId, caseTypeId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(CASE_TYPE_NAME_TAKEN);
      }
      throw error;
    }
  }

  /** Grava o estado final (ja validado pelo servico) sob lock do tipo de caso. */
  async update(
    databaseRef: string,
    clientId: string,
    caseTypeId: string,
    input: CaseTypeWrite,
    identityId: string
  ): Promise<CaseTypeRow> {
    try {
      return await this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
        await this.deferDefaultCheck(tx);
        const updated = await tx.query(
          `UPDATE kanban_case_types
           SET name = $3, description = $4, classification_criteria = $5, expected_evidence = $6,
               default_template_id = $7, active = $8, updated_by_identity_id = $9, updated_at = now()
           WHERE client_id = $1 AND id = $2`,
          [
            clientId,
            caseTypeId,
            input.name,
            input.description,
            input.classificationCriteria,
            input.expectedEvidence,
            input.defaultTemplateId,
            input.active,
            identityId
          ]
        );
        if (updated.rowCount === 0) {
          throw new NotFoundException(CASE_TYPE_NOT_FOUND);
        }
        await this.replaceLinks(tx, clientId, caseTypeId, input.templateIds, identityId);
        return this.finish(tx, clientId, caseTypeId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(CASE_TYPE_NAME_TAKEN);
      }
      throw error;
    }
  }

  /** Vinculos e padrao mudam juntos: a FK so e conferida em `finish`. */
  private async deferDefaultCheck(tx: PoolClient): Promise<void> {
    await tx.query('SET CONSTRAINTS kanban_case_types_default_template_fkey DEFERRED');
  }

  private async replaceLinks(
    tx: PoolClient,
    clientId: string,
    caseTypeId: string,
    templateIds: string[],
    identityId: string
  ): Promise<void> {
    await tx.query(
      `DELETE FROM kanban_case_type_templates
       WHERE client_id = $1 AND case_type_id = $2 AND NOT (template_id = ANY($3::uuid[]))`,
      [clientId, caseTypeId, templateIds]
    );
    await tx.query(
      `INSERT INTO kanban_case_type_templates (client_id, case_type_id, template_id, created_by_identity_id)
       SELECT $1, $2, template_id, $4 FROM unnest($3::uuid[]) AS template_id
       ON CONFLICT (client_id, case_type_id, template_id) DO NOTHING`,
      [clientId, caseTypeId, templateIds, identityId]
    );
  }

  /** Confere o padrao entre os vinculados AGORA (FK adiavel) e devolve a linha atualizada. */
  private async finish(tx: PoolClient, clientId: string, caseTypeId: string): Promise<CaseTypeRow> {
    await tx.query('SET CONSTRAINTS kanban_case_types_default_template_fkey IMMEDIATE');
    const result = await tx.query<CaseTypeRow>(
      `SELECT ${CASE_TYPE_SELECT} FROM kanban_case_types c WHERE c.client_id = $1 AND c.id = $2`,
      [clientId, caseTypeId]
    );
    return result.rows[0];
  }
}
