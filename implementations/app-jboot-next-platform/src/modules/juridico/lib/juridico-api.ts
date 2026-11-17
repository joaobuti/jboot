"use client";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PLATFORM_API_URL ?? "http://127.0.0.1:8010";

const NETWORK_RETRY_DELAYS_MS = [500, 1500];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const dedicated = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("juridicoAccessToken="));
  if (dedicated) {
    return decodeURIComponent(dedicated.split("=").slice(1).join("="));
  }

  const authUser = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("authUser="));
  if (authUser) {
    try {
      const session = JSON.parse(
        decodeURIComponent(authUser.split("=").slice(1).join("="))
      ) as { accessToken?: string };
      if (session.accessToken) {
        return session.accessToken;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetchWithNetworkRetry(`${API_BASE}${path}`, { ...init, headers });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      const problem = (await response.json().catch(() => null)) as JuridicoProblem | null;
      if (problem?.code) {
        throw new JuridicoApiError(problem.title, response.status, problem.code, problem.requestId);
      }
    }
    const message = await response.text().catch(() => "");
    throw new JuridicoApiError(
      message || `Juridico API error ${response.status}`,
      response.status,
      "juridico_data_unavailable"
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetchWithNetworkRetry(`${API_BASE}${path}`, { headers });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Juridico API error ${response.status}`);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] ?? "captacao-export",
  };
}

async function fetchWithNetworkRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === NETWORK_RETRY_DELAYS_MS.length) {
        throw new Error(
          error instanceof TypeError
            ? `Falha de conexão com a API do Jurídico em ${API_BASE}. Verifique se o BFF está ativo e se a origem da tela está liberada no CORS.`
            : "Falha de conexão com a API do Jurídico."
        );
      }
      await wait(NETWORK_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error("Falha de conexão com a API do Jurídico.");
}

export type SupportedAuthType = "user_pass" | "token";

export interface JuridicoProblem {
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
}

export class JuridicoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "JuridicoApiError";
  }
}

export interface DataJudTribunal {
  sigla: string;
  nome: string;
}

export interface DataJudCodeName {
  codigo: string | number | null;
  nome: string;
}

export interface DataJudMovementComplement {
  codigo?: string | number | null;
  nome?: string | null;
  valor?: string | null;
  descricao?: string | null;
}

export interface DataJudMovement {
  codigo: number | null;
  nome: string;
  dataHora: string | null;
  orgaoJulgador: DataJudCodeName | null;
  complementos: DataJudMovementComplement[];
}

export interface DataJudProcess {
  numeroProcesso: string;
  tribunal: string;
  /** Identificador do processo no índice do CNJ (ex: TJSC_JE_5006004...). */
  datajudId: string | null;
  grau: string | null;
  dataAjuizamento: string | null;
  dataUltimaAtualizacao: string | null;
  /** `@timestamp` do índice: sincronização do CNJ, não data processual. */
  sincronizadoEm: string | null;
  nivelSigilo: 0;
  classe: DataJudCodeName | null;
  formato: DataJudCodeName | null;
  sistema: DataJudCodeName | null;
  orgaoJulgador: DataJudCodeName | null;
  assuntos: DataJudCodeName[];
  movimentacoes: DataJudMovement[];
}

export interface DataJudProcessQueryResponse {
  requestId: string;
  source: "datajud";
  capturedAt: string;
  lagNotice: string;
  /** Snapshot persistido da consulta; null quando a persistência falhou. */
  snapshotId: string | null;
  process: DataJudProcess;
}

export interface DataJudProcessByOab {
  numeroProcesso: string;
  numeroProcessoMask: string;
  tribunal: string | null;
  orgao: string | null;
  classe: string | null;
  ultimaPublicacaoEm: string | null;
  publicacoes: number;
  /** Consulta já gravada; permite reabrir os dados sem consultar a fonte. */
  snapshotId: string | null;
  consultadoEm: string | null;
  /** Já existe card no Flow para este processo. */
  exportado: boolean;
  cardUrl: string | null;
}

export interface DataJudProcessesByOabResponse {
  items: DataJudProcessByOab[];
  total: number;
  publicacoesAnalisadas: number;
}

export type DataJudMonitorCadence = "daily" | "weekly" | "biweekly" | "monthly";
export interface DataJudMonitor {
  id: string; tribunal: string | null; cadence: DataJudMonitorCadence; state: "active" | "paused";
  lastCheckedAt: string | null; nextCheckAt: string | null; pausedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface DataJudMonitorMovement { id: string; description: string; occurredAt: string | null; detectedAt: string; }
export interface DeadlineCalculation { id: string; resultDate: string; memory: { skipped: string[]; notice: string }; }
export interface DeadlineCalendar { id:string; year:number; sourceUrl:string|null; sourceReference:string|null; status:string; }

export interface CredencialStatus {
  portalSlug: string;
  authType: SupportedAuthType;
  configured: boolean;
  updatedAt: string | null;
}

export interface SetUserPassBody {
  username: string;
  password: string;
}

export interface SetTokenBody {
  token: string;
}

export type SetCredencialBody = SetUserPassBody | SetTokenBody;

export type ConsultationStatus = "pending" | "done" | "error";

export interface ConsultationDto {
  portalSlug: string;
  portalName: string;
  status: ConsultationStatus;
  lastConsultedAt: string | null;
  errorMessage: string | null;
}

export interface CaptacaoCpfDto {
  id: string;
  cpf: string;
  nome: string | null;
  createdAt: string;
  consultations: ConsultationDto[];
}

export interface CaptacaoPageDto {
  data: CaptacaoCpfDto[];
  meta: { limit: number; offset: number; total: number };
}

export interface ImportResultDto {
  imported: number;
  skipped: number;
  importId: string;
  uf: string;
}

export type SchedulingInterval = "daily" | "weekly" | "biweekly" | "monthly";

export interface SchedulingConfigDto {
  portalSlug: string;
  interval: SchedulingInterval | null;
  status: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface EprocSessionStatus {
  status: "active" | "none";
  sessionId?: string;
  createdAt?: string;
}

export interface EprocSetupStatus {
  phase: string;
  availableProfiles?: { sigla: string; descricao: string }[];
  errorMessage?: string | null;
}

export interface EprocConsultationResult {
  total: number;
  completed: number;
  failed: number;
  processesReceived: number;
  processesPersisted: number;
  processesFiltered: number;
  jobId?: string;
  status?: string;
}

export interface EprocQueryJobStatus {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
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

export interface RunEprocConsultationsBody {
  cpf?: string;
  keyword?: string;
  portalSlug?: string;
  queryRuns?: number;
}

export interface PjeMonitoringConfig {
  configured: boolean;
  numeroOab: string | null;
  ufOab: string | null;
  nomeAdvogado: string | null;
  nomeParte: string | null;
  siglasTribunal: string[];
  lookbackDays: number;
  status: "active" | "inactive";
  updatedAt: string | null;
}

export interface UpdatePjeMonitoringConfigBody {
  numeroOab?: string;
  ufOab?: string;
  nomeAdvogado?: string;
  nomeParte?: string;
  siglasTribunal?: string[];
  lookbackDays?: number;
  status?: "active" | "inactive";
}

export interface PjeSyncJob {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  triggerSource: string;
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
  runningInProcess: boolean;
}

export interface PjeAdvogado {
  id: number | null;
  nome: string | null;
  numero_oab: string | null;
  uf_oab: string | null;
}

export interface PjeDestinatario {
  nome?: string;
  polo?: string;
}

export interface PjeComunicacao {
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
  destinatarios: PjeDestinatario[] | null;
  advogados: PjeAdvogado[] | null;
  createdAt: string;
}

export interface PjeComunicacoesPage {
  items: PjeComunicacao[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PjeComunicacoesFilter {
  page?: number;
  pageSize?: number;
  siglaTribunal?: string;
  tipoComunicacao?: string;
  numeroProcesso?: string;
  dataInicio?: string;
  dataFim?: string;
  busca?: string;
}

export interface PjeResumo {
  total: number;
  ultimaDisponibilizacao: string | null;
}

export interface StartPjeSyncBody {
  lookbackDays?: number;
  numeroProcesso?: string;
  siglaTribunal?: string;
}

export interface FlowBoardOption {
  id: string;
  name: string;
  defaultColumnId: string;
}

export interface FlowOfficeOption {
  id: string;
  name: string;
}

export interface FlowBoardsResponse {
  flowEnabled: boolean;
  boards: FlowBoardOption[];
  /** Escritorios em que o usuario pode criar card no Flow (obrigatorio no export). */
  offices: FlowOfficeOption[];
}

export interface ExportToFlowResponse {
  boardId: string;
  cardId: string;
  cardUrl: string;
  created: boolean;
}

export const juridicoApi = {
  datajud: {
    getStoredProcess: (snapshotId: string) =>
      request<DataJudProcessQueryResponse & { origem: "snapshot" }>(
        `/juridico/datajud/processos/snapshots/${snapshotId}`
      ),
    listProcessesByOab: (numeroOab: string, ufOab: string, dataInicio: string, dataFim: string) =>
      request<DataJudProcessesByOabResponse>(
        `/juridico/datajud/processos/por-oab?${new URLSearchParams({ numeroOab, ufOab, dataInicio, dataFim }).toString()}`
      ),
    listTribunals: () =>
      request<{ items: DataJudTribunal[]; total: number }>("/juridico/datajud/tribunais"),
    queryProcess: (numeroProcesso: string, tribunal?: string) =>
      request<DataJudProcessQueryResponse>("/juridico/datajud/processos/consulta", {
        method: "POST",
        body: JSON.stringify({ numeroProcesso, tribunal: tribunal || undefined }),
      }),
    listMonitors: () => request<DataJudMonitor[]>("/juridico/datajud/acompanhamentos"),
    createMonitor: (body: { processNumber: string; tribunal?: string; cadence: DataJudMonitorCadence }) =>
      request<DataJudMonitor>("/juridico/datajud/acompanhamentos", { method: "POST", body: JSON.stringify(body) }),
    updateMonitor: (id: string, body: Partial<Pick<DataJudMonitor, "cadence" | "state">>) =>
      request<DataJudMonitor>(`/juridico/datajud/acompanhamentos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteMonitor: (id: string) => request<void>(`/juridico/datajud/acompanhamentos/${id}`, { method: "DELETE" }),
    listMonitorMovements: (id: string) => request<DataJudMonitorMovement[]>(`/juridico/datajud/acompanhamentos/${id}/movimentacoes`),
  },
  deadlines: {
    calculate: (body: { startDate: string; businessDays: number; includeStart: boolean }) => request<DeadlineCalculation>("/juridico/prazos/calculos", { method: "POST", body: JSON.stringify(body) }),
    createCalendar: (body: { year: number; sourceUrl?: string; sourceReference?: string }) => request<{ id: string }>("/juridico/prazos/calendarios", { method: "POST", body: JSON.stringify(body) }),
    addCalendarEntry: (id: string, body: { date: string; name: string; reason?: string }) => request<void>(`/juridico/prazos/calendarios/${id}/entradas`, { method: "POST", body: JSON.stringify(body) }),
    listCalendars: () => request<DeadlineCalendar[]>("/juridico/prazos/calendarios"),
  },
  domainIntegrations: {
    listFlowBoards: () =>
      request<FlowBoardsResponse>("/domain-integrations/flow/boards"),
    exportDataJudProcessToFlow: (snapshotId: string, boardId: string, officeId: string) =>
      request<ExportToFlowResponse>(
        `/domain-integrations/juridico/datajud/processos/${snapshotId}/export-flow`,
        { method: "POST", body: JSON.stringify({ boardId, officeId }) }
      ),
    exportPjeComunicacaoToFlow: (comunicacaoId: string, boardId: string, officeId: string) =>
      request<ExportToFlowResponse>(
        `/domain-integrations/juridico/pje/comunicacoes/${comunicacaoId}/export-flow`,
        {
          method: "POST",
          body: JSON.stringify({ boardId, officeId }),
        }
      ),
  },
  captacao: {
    import: (entries: { cpf: string; nome: string }[], uf: string, filename?: string) =>
      request<ImportResultDto>("/juridico/captacao/import", {
        method: "POST",
        body: JSON.stringify({ entries, uf, filename }),
      }),
    list: (limit = 50, offset = 0) =>
      request<CaptacaoPageDto>(`/juridico/captacao?limit=${limit}&offset=${offset}`),
    getConfig: (portalSlug: string) =>
      request<SchedulingConfigDto>(`/juridico/captacao/config/${portalSlug}`),
    setConfig: (portalSlug: string, interval: SchedulingInterval) =>
      request<SchedulingConfigDto>(`/juridico/captacao/config/${portalSlug}`, {
        method: "PUT",
        body: JSON.stringify({ interval }),
      }),
    exportExcel: () => requestBlob("/juridico/captacao/export/excel"),
    exportPdf: () => requestBlob("/juridico/captacao/export/pdf"),
  },
  eproc: {
    getSession: () =>
      request<EprocSessionStatus>("/juridico/eproc/session"),
    startSetup: (preferredProfile?: string) =>
      request<{ setupId: string }>("/juridico/eproc/setup", {
        method: "POST",
        body: JSON.stringify({ preferredProfile: preferredProfile || undefined }),
      }),
    getSetupStatus: (setupId: string) =>
      request<EprocSetupStatus>(`/juridico/eproc/setup/${setupId}/status`),
    submit2fa: (setupId: string, code: string) =>
      request<{ ok: boolean }>(`/juridico/eproc/setup/${setupId}/2fa`, {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    selectProfile: (setupId: string, sigla: string) =>
      request<{ ok: boolean }>(`/juridico/eproc/setup/${setupId}/profile`, {
        method: "POST",
        body: JSON.stringify({ sigla }),
      }),
    runConsultations: (body: RunEprocConsultationsBody = {}) =>
      request<EprocConsultationResult>("/juridico/eproc/run-consultations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getQueryJob: (jobId: string) =>
      request<EprocQueryJobStatus>(`/juridico/eproc/query-jobs/${jobId}`),
    cancelQueryJob: (jobId: string) =>
      request<EprocQueryJobStatus>(`/juridico/eproc/query-jobs/${jobId}/cancel`, {
        method: "POST",
      }),
    getActiveQueryJob: () =>
      request<EprocQueryJobStatus | null>("/juridico/eproc/query-jobs/active/current"),
  },
  pje: {
    getConfig: () => request<PjeMonitoringConfig>("/juridico/pje/config"),
    updateConfig: (body: UpdatePjeMonitoringConfigBody) =>
      request<PjeMonitoringConfig>("/juridico/pje/config", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    getResumo: () => request<PjeResumo>("/juridico/pje/resumo"),
    listComunicacoes: (filter: PjeComunicacoesFilter = {}) => {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      });
      const query = params.toString();
      return request<PjeComunicacoesPage>(
        `/juridico/pje/comunicacoes${query ? `?${query}` : ""}`
      );
    },
    getComunicacao: (id: string) =>
      request<PjeComunicacao>(`/juridico/pje/comunicacoes/${id}`),
    startSync: (body: StartPjeSyncBody = {}) =>
      request<PjeSyncJob>("/juridico/pje/sync", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getActiveSync: () =>
      request<PjeSyncJob | { status: "none" }>("/juridico/pje/sync/active"),
    getSync: (jobId: string) => request<PjeSyncJob>(`/juridico/pje/sync/${jobId}`),
    cancelSync: (jobId: string) =>
      request<{ jobId: string; status: string }>(`/juridico/pje/sync/${jobId}/cancel`, {
        method: "POST",
      }),
  },
  credenciais: {
    get: (portalSlug: string) =>
      request<CredencialStatus>(`/juridico/credenciais/${portalSlug}`),
    set: (portalSlug: string, body: SetCredencialBody) =>
      request<CredencialStatus>(`/juridico/credenciais/${portalSlug}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    remove: (portalSlug: string) =>
      request<void>(`/juridico/credenciais/${portalSlug}`, { method: "DELETE" }),
  },
};
