import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

interface CpfRow {
  id: string;
  cpf: string;
  nome: string | null;
  createdAt: string;
}

interface ConsultationRow {
  cpfId: string;
  portalSlug: string;
  portalName: string;
  status: string;
  lastConsultedAt: string | null;
  errorMessage: string | null;
}

interface SchedulingRow {
  portalSlug: string;
  interval: string | null;
  status: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface CaptacaoExportRow {
  nome: string | null;
  cpf: string;
  processNumber: string;
  author: string | null;
  defendant: string | null;
  partiesText: string | null;
  dataAutuacao: string | Date | null;
  subject: string | null;
}

@Injectable()
export class CaptacaoRepository {
  constructor(private readonly database: DatabaseService) {}

  async createImport(
    clientId: string,
    databaseRef: string,
    uf: string,
    filename?: string,
    createdBy?: string,
  ): Promise<string> {
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `INSERT INTO juridico_captacao_imports (client_id, uf, filename, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [clientId, uf, filename ?? null, createdBy ?? null],
    );
    return result.rows[0].id;
  }

  async insertCpfs(clientId: string, databaseRef: string, entries: { cpf: string; nome: string }[]): Promise<string[]> {
    if (entries.length === 0) return [];
    const cpfs = entries.map((e) => e.cpf);
    const nomes = entries.map((e) => e.nome);
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `INSERT INTO juridico_captacao_cpfs (client_id, cpf, nome)
       SELECT $1, UNNEST($2::varchar[]), UNNEST($3::text[])
       ON CONFLICT (client_id, cpf) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id`,
      [clientId, cpfs, nomes],
    );
    return result.rows.map((r) => r.id);
  }

  async linkImportCpfs(clientId: string, databaseRef: string, importId: string, cpfs: string[]): Promise<void> {
    if (cpfs.length === 0) return;
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_captacao_import_cpfs (import_id, cpf_id)
       SELECT $2, c.id
       FROM juridico_captacao_cpfs c
       WHERE c.client_id = $1
         AND c.cpf = ANY($3::varchar[])
       ON CONFLICT DO NOTHING`,
      [clientId, importId, cpfs],
    );
  }

  async createMissingConsultations(
    clientId: string,
    databaseRef: string,
    cpfs: string[],
    importId: string,
    uf: string,
  ): Promise<void> {
    if (cpfs.length === 0) return;
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_captacao_consultations (cpf_id, portal_id, import_id, client_id, uf)
       SELECT c.id, tp.portal_id, $3, $1, $4
       FROM juridico_captacao_cpfs c
       JOIN juridico_tenant_portals tp
         ON tp.client_id = $1 AND tp.status = 'active'
       JOIN juridico_portal_ufs pu
         ON pu.portal_id = tp.portal_id AND pu.uf = $4 AND pu.status = 'active'
       WHERE c.client_id = $1
         AND c.cpf = ANY($2::varchar[])
       ON CONFLICT DO NOTHING`,
      [clientId, cpfs, importId, uf],
    );
  }

  async countCpfs(clientId: string, databaseRef: string): Promise<number> {
    const result = await this.database.queryForDatabaseRef<{ total: string }>(
      databaseRef,
      `SELECT COUNT(*) AS total FROM juridico_captacao_cpfs WHERE client_id = $1`,
      [clientId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async listCpfs(clientId: string, databaseRef: string, limit: number, offset: number): Promise<CpfRow[]> {
    const result = await this.database.queryForDatabaseRef<CpfRow>(
      databaseRef,
      `SELECT id, cpf, nome, created_at AS "createdAt"
       FROM juridico_captacao_cpfs
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [clientId, limit, offset],
    );
    return result.rows;
  }

  async listConsultations(clientId: string, databaseRef: string, cpfIds: string[]): Promise<ConsultationRow[]> {
    if (cpfIds.length === 0) return [];
    const result = await this.database.queryForDatabaseRef<ConsultationRow>(
      databaseRef,
      `SELECT
         cc.cpf_id              AS "cpfId",
         p.slug                 AS "portalSlug",
         p.name                 AS "portalName",
         cc.status,
         cc.last_consulted_at   AS "lastConsultedAt",
         cc.error_message       AS "errorMessage"
       FROM juridico_captacao_consultations cc
       JOIN juridico_portals p ON p.id = cc.portal_id
       WHERE cc.client_id = $1
         AND cc.cpf_id = ANY($2::uuid[])`,
      [clientId, cpfIds],
    );
    return result.rows;
  }

  async getSchedulingConfig(clientId: string, databaseRef: string, portalSlug: string): Promise<SchedulingRow | null> {
    const result = await this.database.queryForDatabaseRef<SchedulingRow>(
      databaseRef,
      `SELECT
         p.slug       AS "portalSlug",
         sc.interval,
         sc.status,
         sc.last_run_at  AS "lastRunAt",
         sc.next_run_at  AS "nextRunAt"
       FROM juridico_portals p
       LEFT JOIN juridico_scheduling_configs sc
         ON sc.portal_id = p.id AND sc.client_id = $1
       WHERE p.slug = $2 AND p.status = 'active'
       LIMIT 1`,
      [clientId, portalSlug],
    );
    return result.rows[0] ?? null;
  }

  async upsertSchedulingConfig(
    clientId: string,
    databaseRef: string,
    portalSlug: string,
    interval: string,
  ): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_scheduling_configs (client_id, portal_id, interval)
       SELECT $1, p.id, $3
       FROM juridico_portals p
       WHERE p.slug = $2
       ON CONFLICT (client_id, portal_id) DO UPDATE SET
         interval   = EXCLUDED.interval,
         status     = 'active',
         updated_at = now()`,
      [clientId, portalSlug, interval],
    );
  }

  async listExportRows(clientId: string, databaseRef: string): Promise<CaptacaoExportRow[]> {
    const result = await this.database.queryForDatabaseRef<CaptacaoExportRow>(
      databaseRef,
      `SELECT DISTINCT ON (cf.cpf, p.slug, jp.process_number)
         cf.nome,
         cf.cpf,
         jp.process_number       AS "processNumber",
         COALESCE(
           (SELECT party->>'name'
            FROM jsonb_array_elements(jp.parties) party
            WHERE party->>'role' = 'autor'
            LIMIT 1),
           NULLIF(
             trim(regexp_replace(COALESCE(jp.raw_data->>'autor', ''), '<[^>]+>', '', 'g')),
             ''
           )
         )                       AS "author",
         NULLIF(
           trim(regexp_replace(COALESCE(jp.raw_data->>'reu', jp.raw_data->>'str_reu', jp.raw_data->>'nome_reu', ''), '<[^>]+>', '', 'g')),
           ''
         )                       AS "defendant",
         NULLIF(
           (SELECT string_agg(
             concat_ws(': ', party->>'label', NULLIF(party->>'text', '')),
             ' | '
           )
           FROM jsonb_array_elements(jp.parties) party),
           ''
         )                       AS "partiesText",
         jp.data_autuacao        AS "dataAutuacao",
         jp.subject
       FROM juridico_processes jp
       JOIN juridico_portals p
         ON p.id = jp.portal_id
       JOIN juridico_captacao_cpfs cf
         ON cf.client_id = jp.client_id
        AND cf.cpf = jp.cpf_query
       JOIN juridico_captacao_consultations cc
         ON cc.client_id = jp.client_id
        AND cc.cpf_id = cf.id
        AND cc.portal_id = jp.portal_id
        AND cc.status = 'done'
       WHERE jp.client_id = $1
       ORDER BY cf.cpf, p.slug, jp.process_number, cc.last_consulted_at DESC NULLS LAST`,
      [clientId],
    );
    return result.rows;
  }
}
