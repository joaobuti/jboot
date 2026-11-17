/** Produtos que podem ser origem ou destino de um acompanhamento (ADR 021). */
export type ProcessMonitoringProduct = 'juridico' | 'flow';

export type ProcessMonitorCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type ProcessMonitorState = 'active' | 'paused' | 'deleted';

/** Frequencia do DJEN em dias uteis (ADR 022): sem 14/30 para nao perder prazo curto. */
export type DjenCadenceDays = 1 | 3 | 7;

export const DJEN_CADENCE_DAYS: readonly DjenCadenceDays[] = [1, 3, 7];

export type ProcessMonitorSource = 'datajud' | 'djen';

/** Status de uma execucao que falhou, a partir do erro do `svc-jboot-juridico-data`. */
export type ProcessMonitorRunStatus = 'not_found' | 'restricted' | 'rate_limited' | 'timeout' | 'provider_unavailable' | 'failed';

/** Referencia no produto de destino: no Flow, o card que recebe as movimentacoes. */
export type ProcessMonitorDestinationRef =
  | { databaseRef: string }
  | { databaseRef: string; boardId: string; cardId: string };

/** Quem pede: o produto chamador ja autorizou o usuario no proprio dominio. */
export interface ProcessMonitoringCaller {
  clientId: string;
  identityId: string;
  product: ProcessMonitoringProduct;
}

export interface EnsureProcessMonitorInput {
  processNumber: string;
  tribunal: string | null;
  cadence: ProcessMonitorCadence;
  destinationRef: ProcessMonitorDestinationRef;
}

export interface ProcessMonitorView {
  id: string;
  tribunal: string | null;
  cadence: ProcessMonitorCadence;
  state: ProcessMonitorState;
  originProduct: ProcessMonitoringProduct;
  destinationProduct: ProcessMonitoringProduct;
  destinationRef: ProcessMonitorDestinationRef;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  /** Resultado da ultima consulta concluida ao DataJud; null antes da primeira. */
  lastRunStatus: 'success' | ProcessMonitorRunStatus | null;
  /** Fontes do acompanhamento (ADR 022): DataJud ligado/desligado; DJEN ligado/desligado/padrao (null). */
  datajudEnabled: boolean;
  djenEnabled: boolean | null;
  djenCadenceDays: DjenCadenceDays;
  djenLastCheckedAt: string | null;
  /** Data (AAAA-MM-DD, Brasilia) a partir da qual o DJEN vence de novo. */
  djenNextCheckOn: string | null;
  djenLastRunStatus: 'success' | ProcessMonitorRunStatus | null;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Movimentacao do processo na lista do card (Sprint 5); `isNew` = detectada depois do baseline. */
export interface ProcessTimelineMovement {
  id: string;
  description: string;
  occurredAt: string | null;
  isNew: boolean;
  /** Costuma gerar comunicacao no DJEN e tem data: o card mostra "Ver no DJEN" (Sprint 9). */
  djenLookup?: boolean;
}

/** Dados do processo vindos do ultimo retrato do DataJud (Sprint 9). */
export interface ProcessDetailsView {
  filedAt: string | null;
  className: string | null;
  courtName: string | null;
  systemName: string | null;
}

export interface ProcessMovementView {
  id: string;
  description: string;
  occurredAt: string | null;
  detectedAt: string;
}

/** O que o destino recebe quando a execucao encontra movimentacao nova. */
export interface ProcessMovementNotification {
  clientId: string;
  monitorId: string;
  /** Quem pediu o acompanhamento; autor do evento no destino. */
  requestedByIdentityId: string;
  destinationRef: ProcessMonitorDestinationRef;
  /** CNJ mascarado (NNNNNNN-DD.AAAA.J.TR.OOOO). */
  numeroProcesso: string;
  tribunal: string;
  processFingerprint: string;
  newMovements: Array<{ occurredAt: string | null; description: string }>;
}

/** Publicacao do DJEN na lista do destino (ADR 022); texto puro, nunca o HTML do provedor. */
export interface ProcessPublicationView {
  id: string;
  availableOn: string | null;
  communicationType: string | null;
  documentType: string | null;
  courtName: string | null;
  text: string;
  link: string | null;
  isNew: boolean;
}

/** Publicacoes novas do DJEN entregues ao destino. */
export interface ProcessPublicationNotification {
  clientId: string;
  monitorId: string;
  requestedByIdentityId: string;
  destinationRef: ProcessMonitorDestinationRef;
  numeroProcesso: string;
  publications: Array<{
    id: string;
    availableOn: string | null;
    communicationType: string | null;
    documentType: string | null;
    courtName: string | null;
    /** Inicio do texto, para o historico; o texto inteiro fica na lista do card. */
    excerpt: string;
  }>;
}

/** Adaptador de destino, registrado pelo produto no bootstrap. */
export interface ProcessMonitorDeliveryAdapter {
  deliver(notification: ProcessMovementNotification): Promise<void>;
  /** Destino que nao trata publicacoes (Juridico) simplesmente nao implementa. */
  deliverPublications?(notification: ProcessPublicationNotification): Promise<void>;
}

/** Plano do ciclo diario: quais fontes venceram (ADR 022). */
export interface ProcessMonitorPlan {
  active: boolean;
  datajud: boolean;
  djen: boolean;
}

export const PROCESS_MONITORING_CAPABILITY = 'monitoramento-processual';
export const PROCESS_PUBLICATIONS_CAPABILITY = 'publicacoes-processuais';
