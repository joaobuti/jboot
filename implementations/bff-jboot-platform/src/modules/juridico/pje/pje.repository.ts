import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface PjeMonitoringConfigRow {
  numeroOab: string | null;
  ufOab: string | null;
  nomeAdvogado: string | null;
  nomeParte: string | null;
  siglasTribunal: string[] | null;
  lookbackDays: number;
  status: 'active' | 'inactive';
  updatedAt: string | null;
}

export interface PjeComunicacaoRow {
  id: string;
  comunicacaoId: string | null;
  numeroComunicacao: string | null;
  hash: string;
  numeroProcesso: string | null;
  numeroProcessoMask: string | null;
  siglaTribunal: string | null;
  nomeOrgao: string | null;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  nomeClasse: string | null;
  meio: string | null;
  link: string | null;
  texto: string | null;
  dataDisponibilizacao: string | null;
  destinatarios: unknown;
  advogados: unknown;
  createdAt: string;
}

export interface PjeSyncJobRow {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerSource: string;
  filtro: Record<string, unknown>;
  dataInicio: string | null;
  dataFim: string | null;
  paginasLidas: number;
  comunicacoesRecebidas: number;
  comunicacoesNovas: number;
  comunicacoesDuplicadas: number;
  rateLimitWaits: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PjeProviderComunicacao {
  hash: string;
  comunicacaoId: number | null;
  numeroComunicacao: number | null;
  numeroProcesso: string | null;
  numeroProcessoMask: string | null;
  siglaTribunal: string | null;
  nomeOrgao: string | null;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  nomeClasse: string | null;
  meio: string | null;
  link: string | null;
  texto: string | null;
  dataDisponibilizacao: string | null;
  destinatarios: unknown[];
  advogados: unknown[];
}

export interface UpsertConfigInput {
  numeroOab: string | null;
  ufOab: string | null;
  nomeAdvogado: string | null;
  nomeParte: string | null;
  siglasTribunal: string[];
  lookbackDays: number;
  status: 'active' | 'inactive';
}

export interface ListComunicacoesFilter {
  page: number;
  pageSize: number;
  siglaTribunal?: string;
  tipoComunicacao?: string;
  numeroProcesso?: string;
  dataInicio?: string;
  dataFim?: string;
  busca?: string;
}

const COMUNICACAO_COLUMNS = `
  id,
  comunicacao_id        AS "comunicacaoId",
  numero_comunicacao    AS "numeroComunicacao",
  hash,
  numero_processo       AS "numeroProcesso",
  numero_processo_mask  AS "numeroProcessoMask",
  sigla_tribunal        AS "siglaTribunal",
  nome_orgao            AS "nomeOrgao",
  tipo_comunicacao      AS "tipoComunicacao",
  tipo_documento        AS "tipoDocumento",
  nome_classe           AS "nomeClasse",
  meio,
  link,
  texto,
  to_char(data_disponibilizacao, 'YYYY-MM-DD') AS "dataDisponibilizacao",
  destinatarios,
  advogados,
  created_at            AS "createdAt"
`;

@Injectable()
export class PjeRepository {
  constructor(private readonly database: DatabaseService) {}

  async getConfig(clientId: string, databaseRef: string): Promise<PjeMonitoringConfigRow | null> {
    const result = await this.database.queryForDatabaseRef<PjeMonitoringConfigRow>(
      databaseRef,
      `SELECT numero_oab      AS "numeroOab",
              uf_oab          AS "ufOab",
              nome_advogado   AS "nomeAdvogado",
              nome_parte      AS "nomeParte",
              siglas_tribunal AS "siglasTribunal",
              lookback_days   AS "lookbackDays",
              status,
              updated_at      AS "updatedAt"
       FROM juridico_pje_monitoring_configs
       WHERE client_id = $1`,
      [clientId],
    );
    return result.rows[0] ?? null;
  }

  async upsertConfig(clientId: string, databaseRef: string, input: UpsertConfigInput): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_pje_monitoring_configs
         (client_id, numero_oab, uf_oab, nome_advogado, nome_parte, siglas_tribunal, lookback_days, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (client_id) DO UPDATE SET
         numero_oab      = EXCLUDED.numero_oab,
         uf_oab          = EXCLUDED.uf_oab,
         nome_advogado   = EXCLUDED.nome_advogado,
         nome_parte      = EXCLUDED.nome_parte,
         siglas_tribunal = EXCLUDED.siglas_tribunal,
         lookback_days   = EXCLUDED.lookback_days,
         status          = EXCLUDED.status,
         updated_at      = now()`,
      [
        clientId,
        input.numeroOab,
        input.ufOab,
        input.nomeAdvogado,
        input.nomeParte,
        input.siglasTribunal,
        input.lookbackDays,
        input.status,
      ],
    );
  }

  async listComunicacoes(
    clientId: string,
    databaseRef: string,
    filter: ListComunicacoesFilter,
  ): Promise<{ items: PjeComunicacaoRow[]; total: number }> {
    const conditions = ['client_id = $1'];
    const values: unknown[] = [clientId];

    const push = (sql: string, value: unknown): void => {
      values.push(value);
      conditions.push(sql.replace('$?', `$${values.length}`));
    };

    if (filter.siglaTribunal) push('sigla_tribunal = $?', filter.siglaTribunal.toUpperCase());
    if (filter.tipoComunicacao) push('tipo_comunicacao = $?', filter.tipoComunicacao);
    if (filter.numeroProcesso) push('numero_processo = $?', filter.numeroProcesso);
    if (filter.dataInicio) push('data_disponibilizacao >= $?::date', filter.dataInicio);
    if (filter.dataFim) push('data_disponibilizacao <= $?::date', filter.dataFim);
    if (filter.busca) push('texto ILIKE $?', `%${filter.busca}%`);

    const where = conditions.join(' AND ');
    const offset = (filter.page - 1) * filter.pageSize;

    const totalResult = await this.database.queryForDatabaseRef<{ total: string }>(
      databaseRef,
      `SELECT count(*)::text AS total FROM juridico_pje_comunicacoes WHERE ${where}`,
      values,
    );

    const itemsResult = await this.database.queryForDatabaseRef<PjeComunicacaoRow>(
      databaseRef,
      `SELECT ${COMUNICACAO_COLUMNS}
       FROM juridico_pje_comunicacoes
       WHERE ${where}
       ORDER BY data_disponibilizacao DESC NULLS LAST, created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, filter.pageSize, offset],
    );

    return {
      items: itemsResult.rows,
      total: Number(totalResult.rows[0]?.total ?? '0'),
    };
  }

  async getComunicacao(
    clientId: string,
    databaseRef: string,
    id: string,
  ): Promise<PjeComunicacaoRow | null> {
    const result = await this.database.queryForDatabaseRef<PjeComunicacaoRow>(
      databaseRef,
      `SELECT ${COMUNICACAO_COLUMNS}
       FROM juridico_pje_comunicacoes
       WHERE client_id = $1 AND id = $2`,
      [clientId, id],
    );
    return result.rows[0] ?? null;
  }

  async getResumo(
    clientId: string,
    databaseRef: string,
  ): Promise<{ total: number; ultimaDisponibilizacao: string | null }> {
    const result = await this.database.queryForDatabaseRef<{
      total: string;
      ultima: string | null;
    }>(
      databaseRef,
      `SELECT count(*)::text AS total,
              to_char(max(data_disponibilizacao), 'YYYY-MM-DD') AS ultima
       FROM juridico_pje_comunicacoes
       WHERE client_id = $1`,
      [clientId],
    );
    return {
      total: Number(result.rows[0]?.total ?? '0'),
      ultimaDisponibilizacao: result.rows[0]?.ultima ?? null,
    };
  }

  async createSyncJob(clientId: string, databaseRef: string, input: { filtro: Record<string, unknown>; dataInicio: string; dataFim: string }): Promise<PjeSyncJobRow> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE juridico_pje_sync_jobs SET status = 'cancelled', last_error = 'Substituido por nova sincronizacao', finished_at = now(), updated_at = now()
       WHERE client_id = $1 AND status IN ('queued', 'running')`,
      [clientId],
    );
    const result = await this.database.queryForDatabaseRef<PjeSyncJobRow>(
      databaseRef,
      `INSERT INTO juridico_pje_sync_jobs (client_id, portal_id, status, trigger_source, filtro, data_inicio, data_fim)
       SELECT $1, id, 'queued', 'manual', $2::jsonb, $3::date, $4::date FROM juridico_portals WHERE slug = 'pje'
       RETURNING ${SYNC_JOB_COLUMNS}`,
      [clientId, JSON.stringify(input.filtro), input.dataInicio, input.dataFim],
    );
    if (!result.rows[0]) throw new Error('Portal PJe nao cadastrado');
    return result.rows[0];
  }

  async getActiveOrLastSyncJob(clientId: string, databaseRef: string): Promise<PjeSyncJobRow | null> {
    const result = await this.database.queryForDatabaseRef<PjeSyncJobRow>(databaseRef,
      `SELECT ${SYNC_JOB_COLUMNS} FROM juridico_pje_sync_jobs WHERE client_id = $1 ORDER BY (status IN ('queued', 'running')) DESC, created_at DESC LIMIT 1`, [clientId]);
    return result.rows[0] ?? null;
  }

  async getSyncJob(clientId: string, databaseRef: string, jobId: string): Promise<PjeSyncJobRow | null> {
    const result = await this.database.queryForDatabaseRef<PjeSyncJobRow>(databaseRef,
      `SELECT ${SYNC_JOB_COLUMNS} FROM juridico_pje_sync_jobs WHERE client_id = $1 AND id = $2`, [clientId, jobId]);
    return result.rows[0] ?? null;
  }

  async markSyncRunning(databaseRef: string, jobId: string): Promise<void> {
    await this.database.queryForDatabaseRef(databaseRef, `UPDATE juridico_pje_sync_jobs SET status = 'running', started_at = now(), updated_at = now() WHERE id = $1 AND status = 'queued'`, [jobId]);
  }

  async updateSyncProgress(databaseRef: string, jobId: string, values: { paginas: number; recebidas: number; novas: number; duplicadas: number }): Promise<void> {
    await this.database.queryForDatabaseRef(databaseRef,
      `UPDATE juridico_pje_sync_jobs SET paginas_lidas = $2, comunicacoes_recebidas = $3, comunicacoes_novas = $4, comunicacoes_duplicadas = $5, updated_at = now() WHERE id = $1`,
      [jobId, values.paginas, values.recebidas, values.novas, values.duplicadas]);
  }

  async finishSyncJob(databaseRef: string, jobId: string, status: 'completed' | 'failed' | 'cancelled', error: string | null = null): Promise<void> {
    await this.database.queryForDatabaseRef(databaseRef, `UPDATE juridico_pje_sync_jobs SET status = $2, last_error = $3, finished_at = now(), updated_at = now() WHERE id = $1`, [jobId, status, error]);
  }

  async upsertComunicacoes(clientId: string, databaseRef: string, jobId: string, items: PjeProviderComunicacao[]): Promise<{ novas: number; duplicadas: number }> {
    let novas = 0;
    for (const item of items) {
      const result = await this.database.queryForDatabaseRef<{ inserida: boolean }>(databaseRef,
        `INSERT INTO juridico_pje_comunicacoes (client_id, comunicacao_id, numero_comunicacao, hash, numero_processo, numero_processo_mask, sigla_tribunal, nome_orgao, tipo_comunicacao, tipo_documento, nome_classe, meio, link, texto, data_disponibilizacao, destinatarios, advogados, sync_job_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16::jsonb,$17::jsonb,$18)
         ON CONFLICT (client_id, hash) DO UPDATE SET texto = EXCLUDED.texto, link = EXCLUDED.link, updated_at = now()
         RETURNING (xmax = 0) AS inserida`,
        [clientId, item.comunicacaoId, item.numeroComunicacao, item.hash, item.numeroProcesso, item.numeroProcessoMask, item.siglaTribunal, item.nomeOrgao, item.tipoComunicacao, item.tipoDocumento, item.nomeClasse, item.meio, item.link, item.texto, item.dataDisponibilizacao, JSON.stringify(item.destinatarios), JSON.stringify(item.advogados), jobId]);
      novas += result.rows[0]?.inserida ? 1 : 0;
    }
    return { novas, duplicadas: items.length - novas };
  }
}

const SYNC_JOB_COLUMNS = `id, status, trigger_source AS "triggerSource", filtro, to_char(data_inicio, 'YYYY-MM-DD') AS "dataInicio", to_char(data_fim, 'YYYY-MM-DD') AS "dataFim", paginas_lidas AS "paginasLidas", comunicacoes_recebidas AS "comunicacoesRecebidas", comunicacoes_novas AS "comunicacoesNovas", comunicacoes_duplicadas AS "comunicacoesDuplicadas", rate_limit_waits AS "rateLimitWaits", last_error AS "lastError", started_at::text AS "startedAt", finished_at::text AS "finishedAt", created_at::text AS "createdAt", updated_at::text AS "updatedAt"`;
