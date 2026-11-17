import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JuridicoRequestContext } from '../shared/juridico.types';
import { CredenciaisService } from '../credenciais/credenciais.service';
import { CryptoService } from '../shared/crypto.service';
import { AppConfigService } from '../../../config/app-config.service';
import { DatabaseService } from '../../../database/database.service';

export interface SessionStatusDto {
  status: 'active' | 'none';
  sessionId?: string;
  createdAt?: string;
}

export interface SetupStatusDto {
  phase: string;
  availableProfiles?: { sigla: string; descricao: string }[];
  errorMessage?: string | null;
}

interface RunConsultationsOptions {
  cpf?: string;
  keyword?: string;
  portalSlug?: string;
  queryRuns?: number;
}

export interface EprocQueryJobStatusDto {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  successCount: number;
  errorCount: number;
  processesReceived: number;
  processesPersisted: number;
  processesFiltered: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  runningInProcess?: boolean;
}

interface PendingConsultationRow {
  id: string;
  cpf: string;
}

interface EprocProcessResult {
  numero?: string;
  tribunal?: string;
  assunto?: string | null;
  data_distribuicao?: string | null;
  data_autuacao?: string | null;
  raw_data?: unknown;
  parties?: unknown;
  [key: string]: unknown;
}

interface EprocSetupWorkerResponse {
  phase?: unknown;
  available_profiles?: { sigla: string; descricao: string }[];
  error_message?: unknown;
}

@Injectable()
export class EprocSessionService {
  constructor(
    private readonly credenciais: CredenciaisService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
  ) {}

  async getSessionStatus(ctx: JuridicoRequestContext): Promise<SessionStatusDto> {
    const resp = await this.workerGet(
      `/eproc/session?client_id=${ctx.clientId}&database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
    ) as { status: 'active' | 'none'; session_id?: string; created_at?: string };
    return {
      status: resp.status,
      sessionId: resp.session_id,
      createdAt: resp.created_at,
    };
  }

  async startSetup(
    ctx: JuridicoRequestContext,
    preferredProfile?: string,
  ): Promise<{ setupId: string }> {
    const plain = await this.credenciais.getDecrypted(ctx.clientId, ctx.databaseRef, 'eproc');
    if (!plain) {
      throw new BadRequestException('Configure as credenciais do eProc antes de iniciar o setup da sessão');
    }

    const setupId = randomUUID();
    await this.workerPost('/eproc/setup', {
      setup_id: setupId,
      client_id: ctx.clientId,
      username: plain.username,
      password: plain.password,
      database_url: this.juridicoDatabaseUrl(),
      preferred_profile: preferredProfile?.trim() || undefined,
    });

    return { setupId };
  }

  async getSetupStatus(setupId: string): Promise<SetupStatusDto> {
    const resp = await this.workerGet(
      `/eproc/setup/${setupId}/status?database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
    ) as EprocSetupWorkerResponse;
    return {
      phase: String(resp.phase ?? ''),
      availableProfiles: resp.available_profiles ?? undefined,
      errorMessage: resp.error_message ? String(resp.error_message) : null,
    };
  }

  async submit2fa(setupId: string, code: string): Promise<{ ok: true }> {
    await this.workerPost(
      `/eproc/setup/${setupId}/2fa?database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
      { code },
    );
    return { ok: true };
  }

  async selectProfile(setupId: string, sigla: string): Promise<{ ok: true }> {
    await this.workerPost(
      `/eproc/setup/${setupId}/profile?database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
      { sigla },
    );
    return { ok: true };
  }

  async runPendingConsultations(ctx: JuridicoRequestContext, options: RunConsultationsOptions = {}): Promise<{
    total: number;
    completed: number;
    failed: number;
    processesReceived: number;
    processesPersisted: number;
    processesFiltered: number;
    jobId?: string;
    status?: string;
  }> {
    const sessionStatus = await this.getSessionStatus(ctx);
    if (sessionStatus.status !== 'active') {
      throw new BadRequestException('Sessão eProc não configurada — faça o setup primeiro');
    }

    const cpf = options.cpf?.replace(/\D/g, '') || null;
    const keyword = options.keyword?.trim() || null;
    const portalSlug = options.portalSlug?.trim() || 'eproc';
    const queryRuns = Math.max(1, Math.min(Number(options.queryRuns ?? 1), 250));
    if (portalSlug !== 'eproc') {
      throw new BadRequestException(`Portal ${portalSlug} ainda não possui worker de consulta manual`);
    }

    const response = await this.workerPost('/eproc/query-jobs', {
      client_id: ctx.clientId,
      database_url: this.juridicoDatabaseUrl(),
      cpf: cpf ?? undefined,
      keyword: keyword ?? undefined,
      portal_slug: portalSlug,
      batch_size: 1,
      max_consultations: queryRuns * 10,
    }) as { job_id: string; status: string; total: number };

    return {
      jobId: response.job_id,
      status: response.status,
      total: response.total,
      completed: 0,
      failed: 0,
      processesReceived: 0,
      processesPersisted: 0,
      processesFiltered: 0,
    };
  }

  async getQueryJobStatus(ctx: JuridicoRequestContext, jobId: string): Promise<EprocQueryJobStatusDto> {
    const response = await this.workerGet(
      `/eproc/query-jobs/${jobId}?client_id=${ctx.clientId}&database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
    ) as Record<string, unknown>;
    return this.mapQueryJobStatus(response);
  }

  async getActiveQueryJobStatus(ctx: JuridicoRequestContext): Promise<EprocQueryJobStatusDto | null> {
    const response = await this.workerGet(
      `/eproc/query-jobs/active?client_id=${ctx.clientId}&database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
    ) as Record<string, unknown>;

    if (response.status === 'none') {
      return null;
    }

    const status = this.mapQueryJobStatus(response);
    if (['queued', 'running'].includes(status.status) && !status.runningInProcess) {
      await this.workerPost(
        `/eproc/query-jobs/${status.jobId}/resume?client_id=${ctx.clientId}&database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}&batch_size=1`,
        {},
      );
      return this.getQueryJobStatus(ctx, status.jobId);
    }

    return status;
  }

  async cancelQueryJob(ctx: JuridicoRequestContext, jobId: string): Promise<EprocQueryJobStatusDto> {
    await this.workerPost(
      `/eproc/query-jobs/${jobId}/cancel?client_id=${ctx.clientId}&database_url=${encodeURIComponent(this.juridicoDatabaseUrl())}`,
      {},
    );
    return this.getQueryJobStatus(ctx, jobId);
  }

  private mapQueryJobStatus(response: Record<string, unknown>): EprocQueryJobStatusDto {
    return {
      jobId: String(response.job_id),
      status: response.status as EprocQueryJobStatusDto['status'],
      total: Number(response.total ?? 0),
      processed: Number(response.processed ?? 0),
      successCount: Number(response.success_count ?? 0),
      errorCount: Number(response.error_count ?? 0),
      processesReceived: Number(response.processes_received ?? 0),
      processesPersisted: Number(response.processes_persisted ?? 0),
      processesFiltered: Number(response.processes_filtered ?? 0),
      lastError: response.last_error ? String(response.last_error) : null,
      startedAt: response.started_at ? String(response.started_at) : null,
      finishedAt: response.finished_at ? String(response.finished_at) : null,
      createdAt: response.created_at ? String(response.created_at) : null,
      updatedAt: response.updated_at ? String(response.updated_at) : null,
      runningInProcess: Boolean(response.running_in_process),
    };
  }

  private async loadPendingEprocConsultations(ctx: JuridicoRequestContext, cpf: string | null, portalSlug: string) {
    if (cpf) {
      const existing = await this.database.queryForDatabaseRef<PendingConsultationRow>(
        ctx.databaseRef,
        `SELECT cc.id, cf.cpf
         FROM juridico_captacao_consultations cc
         JOIN juridico_captacao_cpfs cf ON cf.id = cc.cpf_id
         JOIN juridico_portals p ON p.id = cc.portal_id
         WHERE cc.client_id = $1
           AND p.slug = $3
           AND cf.cpf = $2
         ORDER BY cc.created_at DESC
         LIMIT 1`,
        [ctx.clientId, cpf, portalSlug],
      );
      if (existing.rows.length > 0) {
        return existing;
      }

      return this.database.queryForDatabaseRef<PendingConsultationRow>(
        ctx.databaseRef,
        `WITH cpf_row AS (
           INSERT INTO juridico_captacao_cpfs (client_id, cpf)
           VALUES ($1, $2)
           ON CONFLICT (client_id, cpf) DO UPDATE SET cpf = EXCLUDED.cpf
           RETURNING id, cpf
         ),
         portal_row AS (
           SELECT id FROM juridico_portals WHERE slug = $3 LIMIT 1
         ),
         inserted AS (
           INSERT INTO juridico_captacao_consultations (cpf_id, portal_id, client_id, uf, status)
           SELECT cpf_row.id, portal_row.id, $1, 'SC', 'pending'
           FROM cpf_row, portal_row
           RETURNING id
         )
         SELECT inserted.id, cpf_row.cpf
         FROM inserted, cpf_row`,
        [ctx.clientId, cpf, portalSlug],
      );
    }

    return this.database.queryForDatabaseRef<PendingConsultationRow>(
      ctx.databaseRef,
      `SELECT cc.id, cf.cpf
       FROM juridico_captacao_consultations cc
       JOIN juridico_captacao_cpfs cf ON cf.id = cc.cpf_id
       JOIN juridico_portals p ON p.id = cc.portal_id
       WHERE cc.client_id = $1
         AND p.slug = $2
         AND cc.status = 'pending'
       ORDER BY cc.created_at ASC
       LIMIT 5`,
      [ctx.clientId, portalSlug],
    );
  }

  private async ensureMissingEprocConsultations(ctx: JuridicoRequestContext, portalSlug: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      ctx.databaseRef,
      `WITH portal_row AS (
         SELECT id FROM juridico_portals WHERE slug = $2 AND status = 'active' LIMIT 1
       ),
       latest_import AS (
         SELECT DISTINCT ON (ic.cpf_id)
                ic.cpf_id,
                ci.id AS import_id,
                ci.uf
         FROM juridico_captacao_import_cpfs ic
         JOIN juridico_captacao_imports ci
           ON ci.id = ic.import_id
          AND ci.client_id = $1
         ORDER BY ic.cpf_id, ci.created_at DESC
       )
       INSERT INTO juridico_captacao_consultations (cpf_id, portal_id, import_id, client_id, uf, status)
       SELECT c.id, portal_row.id, latest_import.import_id, $1, latest_import.uf, 'pending'
       FROM juridico_captacao_cpfs c
       JOIN latest_import ON latest_import.cpf_id = c.id
       CROSS JOIN portal_row
       WHERE c.client_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM juridico_captacao_consultations existing
           WHERE existing.cpf_id = c.id
             AND existing.portal_id = portal_row.id
         )
       ON CONFLICT DO NOTHING`,
      [ctx.clientId, portalSlug],
    );
  }

  private async invalidateLatestSession(ctx: JuridicoRequestContext, errorMessage: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      ctx.databaseRef,
      `UPDATE juridico_eproc_sessions
       SET phase = 'failed',
           error_message = $2,
           updated_at = now()
       WHERE id = (
         SELECT id
         FROM juridico_eproc_sessions
         WHERE client_id = $1
           AND phase = 'completed'
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [ctx.clientId, errorMessage],
    );
  }

  private async persistEprocProcesses(
    ctx: JuridicoRequestContext,
    cpf: string,
    processes: EprocProcessResult[],
    keyword: string | null,
  ): Promise<{ received: number; persisted: number; filtered: number }> {
    let persisted = 0;
    let filtered = 0;

    const candidates = processes.map((process) => {
      const rawData = this.rawProcessData(process);
      const parties = this.rawProcessParties(process);
      const matches = keyword ? this.findKeywordMatches(rawData, keyword) : [];
      const dataAutuacao = this.parseIsoDate(process.data_autuacao ?? process.data_distribuicao);
      return { process, rawData, parties, matches, dataAutuacao };
    });
    const hasKeywordMatch = Boolean(keyword && candidates.some((candidate) => candidate.matches.length > 0));

    for (const candidate of candidates) {
      if (hasKeywordMatch && candidate.matches.length === 0) {
        filtered++;
        continue;
      }
      if (!hasKeywordMatch && !this.isWithinLastYears(candidate.dataAutuacao, 5)) {
        filtered++;
        continue;
      }

      const { process, rawData, parties, matches, dataAutuacao } = candidate;

      const processNumber = String(process.numero ?? '').trim();
      if (!processNumber) {
        filtered++;
        continue;
      }

      const portal = await this.database.queryForDatabaseRef<{ id: string }>(
        ctx.databaseRef,
        `SELECT id FROM juridico_portals WHERE slug = 'eproc' LIMIT 1`,
        [],
      );
      const portalId = portal.rows[0]?.id;
      if (!portalId) {
        throw new NotFoundException('Portal eProc não encontrado');
      }

      const existing = await this.database.queryForDatabaseRef<{ id: string }>(
        ctx.databaseRef,
        `SELECT id
         FROM juridico_processes
         WHERE client_id = $1
           AND portal_id = $2
           AND process_number = $3
           AND cpf_query = $4
         LIMIT 1`,
        [ctx.clientId, portalId, processNumber, cpf],
      );

      const matchData = keyword ? { keyword, matches } : {};
      if (existing.rows[0]) {
        await this.database.queryForDatabaseRef(
          ctx.databaseRef,
          `UPDATE juridico_processes
           SET subject = $2,
               data_autuacao = $3,
               parties = $4::jsonb,
               raw_data = $5::jsonb,
               match_data = $6::jsonb,
               updated_at = now()
           WHERE id = $1`,
          [
            existing.rows[0].id,
            process.assunto ?? null,
            dataAutuacao,
            JSON.stringify(parties),
            JSON.stringify(rawData),
            JSON.stringify(matchData),
          ],
        );
      } else {
        await this.database.queryForDatabaseRef(
          ctx.databaseRef,
          `INSERT INTO juridico_processes
             (client_id, portal_id, process_number, cpf_query, subject, data_autuacao, parties, raw_data, match_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
          [
            ctx.clientId,
            portalId,
            processNumber,
            cpf,
            process.assunto ?? null,
            dataAutuacao,
            JSON.stringify(parties),
            JSON.stringify(rawData),
            JSON.stringify(matchData),
          ],
        );
      }
      persisted++;
    }

    return { received: processes.length, persisted, filtered };
  }

  private rawProcessData(process: EprocProcessResult): unknown {
    return process.raw_data ?? process;
  }

  private rawProcessParties(process: EprocProcessResult): unknown[] {
    const rawData = this.rawProcessData(process);
    const parties = process.parties
      ?? (rawData && typeof rawData === 'object' ? (rawData as Record<string, unknown>).parties : undefined);
    if (Array.isArray(parties) && parties.length > 0) {
      return parties;
    }

    if (!rawData || typeof rawData !== 'object') {
      return [];
    }

    const raw = rawData as Record<string, unknown>;
    const fallback: unknown[] = [];
    const autor = this.cleanPartyText(raw.autor);
    const reu = this.cleanPartyText(raw.reu);
    if (autor) {
      fallback.push({ role: 'autor', label: 'AUTOR', name: autor, text: autor, source: 'result_row' });
    }
    if (reu) {
      fallback.push({ role: 'reu', label: 'RÉU', name: reu, text: reu, source: 'result_row' });
    }
    return fallback;
  }

  private cleanPartyText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/,$/, '')
      .trim();
  }

  private findKeywordMatches(value: unknown, keyword: string): Array<{
    path: string;
    key: string | null;
    value: string;
    index: number;
  }> {
    const needle = keyword.toLocaleLowerCase('pt-BR');
    const matches: Array<{ path: string; key: string | null; value: string; index: number }> = [];

    const visit = (node: unknown, path: string, key: string | null) => {
      if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
        const text = String(node);
        const index = text.toLocaleLowerCase('pt-BR').indexOf(needle);
        if (index >= 0) {
          matches.push({ path, key, value: text, index });
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((item, index) => visit(item, `${path}[${index}]`, String(index)));
        return;
      }
      if (node && typeof node === 'object') {
        for (const [childKey, childValue] of Object.entries(node as Record<string, unknown>)) {
          visit(childValue, `${path}.${childKey}`, childKey);
        }
      }
    };

    visit(value, '$', null);
    return matches;
  }

  private parseIsoDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    return value;
  }

  private isWithinLastYears(date: string | null, years: number): boolean {
    if (!date) {
      return false;
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - years);
    return parsed >= threshold;
  }

  private async loadDecryptedSession(ctx: JuridicoRequestContext): Promise<string> {
    const result = await this.database.queryForDatabaseRef<{
      session_state_enc: Buffer;
    }>(
      ctx.databaseRef,
      `SELECT session_state_enc
       FROM juridico_eproc_sessions
       WHERE client_id = $1 AND phase = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [ctx.clientId],
    );
    if (!result.rows[0]) throw new NotFoundException('Sessão eProc não encontrada');
    return this.crypto.decrypt(ctx.clientId, result.rows[0].session_state_enc);
  }

  private juridicoDatabaseUrl(): string {
    return (
      this.config.connectionUrls['postgres.juridico'] ??
      'postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev'
    );
  }

  private async workerGet(path: string): Promise<unknown> {
    const url = `${this.config.workerJuridicoUrl}${path}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new ServiceUnavailableException(`Worker error: ${resp.status}`);
    }
    return resp.json();
  }

  private async workerPost(path: string, body: unknown): Promise<unknown> {
    const url = `${this.config.workerJuridicoUrl}${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new ServiceUnavailableException(`Worker error ${resp.status}: ${text}`);
    }
    return resp.json();
  }
}
