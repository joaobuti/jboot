import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { DataJudMonitorCryptoService } from '../shared/crypto/datajud-monitor-crypto.service';
import { DataJudClientService } from '../shared/juridico-data/datajud-client.service';
import {
  maskCnj,
  nextCheckAt,
  processDigits,
  processNumberHmac,
  runStatusFromError,
  snapshotFromResponse
} from './process-fingerprint';
import { ProcessMonitoringCapabilityService } from './process-monitoring-capability.service';
import {
  DJEN_BASELINE_DAYS,
  addBusinessDays,
  addDays,
  dateInBrasilia,
  lookupWindow,
  movementMayHaveCommunication,
  publicationExcerpt,
  publicationText,
  todayInBrasilia
} from './process-publications';
import { ProcessMonitoringDeliveryRegistry } from './process-monitoring-delivery.registry';
import { NewProcessPublication, ProcessMonitoringRepository, StoredProcessPublication } from './process-monitoring.repository';
import { ProcessMonitoringWorkflowClient } from './process-monitoring-workflow.client';
import {
  DjenCadenceDays,
  EnsureProcessMonitorInput,
  ProcessDetailsView,
  ProcessMonitorPlan,
  ProcessMonitorSource,
  ProcessPublicationView,
  ProcessMonitorCadence,
  ProcessMonitorDestinationRef,
  ProcessMonitorView,
  ProcessMonitoringCaller,
  ProcessMonitoringProduct,
  ProcessMovementView,
  ProcessTimelineMovement
} from './process-monitoring.types';

/** Paginas do DJEN por execucao: 100 itens cada; processo comum tem poucas comunicacoes por periodo. */
const DJEN_MAX_PAGES = 5;

export interface ProcessMonitorRunResult {
  idempotencyKey: string;
  status: 'duplicate' | 'success';
  movementsDetected: number;
}

/**
 * Interface publica da capacidade `monitoramento-processual` (ADR 021). O produto chamador autoriza o
 * usuario no proprio dominio e se identifica em `caller.product`; aqui valem a capacidade do cliente,
 * a unicidade por processo e o dono do acompanhamento (so o produto de destino pausa, retoma ou exclui).
 */
@Injectable()
export class ProcessMonitoringService {
  constructor(
    private readonly repository: ProcessMonitoringRepository,
    private readonly crypto: DataJudMonitorCryptoService,
    private readonly capability: ProcessMonitoringCapabilityService,
    private readonly workflow: ProcessMonitoringWorkflowClient,
    private readonly delivery: ProcessMonitoringDeliveryRegistry,
    private readonly dataJud: DataJudClientService,
    private readonly config: AppConfigService
  ) {}

  /**
   * Garante acompanhamento ativo do processo para o destino pedido: reaproveita o do mesmo destino
   * (retomando se pausado) ou cria. Processo ja acompanhado por outro destino devolve 409 com o
   * produto que acompanha, sem criar o segundo.
   */
  async ensureActive(caller: ProcessMonitoringCaller, input: EnsureProcessMonitorInput): Promise<{ id: string; created: boolean }> {
    return this.open(caller, input, true);
  }

  /**
   * Cria sem reaproveitar: processo ja acompanhado devolve 409, mesmo no proprio destino. E o contrato
   * da tela Acompanhamentos do Juridico ("Processo ja possui acompanhamento ativo").
   */
  async create(caller: ProcessMonitoringCaller, input: EnsureProcessMonitorInput): Promise<ProcessMonitorView> {
    const { id } = await this.open(caller, input, false);
    return this.get(caller, id);
  }

  private async open(caller: ProcessMonitoringCaller, input: EnsureProcessMonitorInput, reuse: boolean): Promise<{ id: string; created: boolean }> {
    await this.capability.require(caller.clientId);
    const hmac = this.hmac(input.processNumber);
    const existing = await this.repository.findLiveByHmac(caller.clientId, hmac);
    if (existing) {
      if (!reuse) throw this.inUse(caller, existing);
      return { id: (await this.reuse(caller, existing, input.destinationRef)).id, created: false };
    }
    let monitor: ProcessMonitorView;
    try {
      monitor = await this.repository.create({
        clientId: caller.clientId,
        identityId: caller.identityId,
        tribunal: input.tribunal?.toUpperCase() ?? null,
        ciphertext: this.crypto.encrypt(caller.clientId, processDigits(input.processNumber)),
        encryptionKeyVersion: this.config.juridicoMonitorEncryptionKeyVersion,
        hmac,
        hmacKeyVersion: this.config.juridicoDataAuditHmacKeyVersion,
        cadence: input.cadence,
        nextCheckAt: nextCheckAt(input.cadence),
        originProduct: caller.product,
        destinationProduct: caller.product,
        destinationRef: input.destinationRef
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      // Corrida com outro pedido do mesmo processo: o indice unico decidiu; vale a regra do vencedor.
      const winner = await this.repository.findLiveByHmac(caller.clientId, hmac);
      if (!winner) throw error;
      if (!reuse) throw this.inUse(caller, winner);
      return { id: (await this.reuse(caller, winner, input.destinationRef)).id, created: false };
    }
    try {
      await this.workflow.start(caller.clientId, monitor.id, monitor.cadence);
    } catch (error) {
      // Sem workflow o acompanhamento nao roda: nao deixa registro ativo orfao.
      await this.repository.markDeleted(caller.clientId, monitor.id);
      throw error;
    }
    return { id: monitor.id, created: true };
  }

  /**
   * Onde o processo ja e acompanhado no cliente, sem expor a referencia de outro produto. Usado antes
   * de criar card, para nao deixar card orfao quando o processo ja tem dono.
   */
  async findLiveByProcess(
    caller: ProcessMonitoringCaller,
    processNumber: string
  ): Promise<{ id: string; destinationProduct: ProcessMonitoringProduct; destinationRef: ProcessMonitorDestinationRef | null } | null> {
    const monitor = await this.repository.findLiveByHmac(caller.clientId, this.hmac(processNumber));
    if (!monitor) return null;
    return {
      id: monitor.id,
      destinationProduct: monitor.destinationProduct,
      destinationRef: monitor.destinationProduct === caller.product ? monitor.destinationRef : null
    };
  }

  /** Acompanhamento cujo destino e o card do Flow (toggle e cadencia do card). */
  findByDestinationCard(caller: ProcessMonitoringCaller, databaseRef: string, cardId: string): Promise<ProcessMonitorView | null> {
    return this.repository.findByDestinationCard(caller.clientId, databaseRef, cardId);
  }

  /** O cliente contratou a capacidade? Para a tela avisar antes de tentar. */
  isEnabled(caller: ProcessMonitoringCaller): Promise<boolean> {
    return this.capability.isEnabled(caller.clientId);
  }

  async get(caller: ProcessMonitoringCaller, id: string): Promise<ProcessMonitorView> {
    const monitor = await this.repository.find(caller.clientId, id);
    if (!monitor || monitor.destinationProduct !== caller.product) throw new NotFoundException('Acompanhamento nao encontrado');
    return monitor;
  }

  list(caller: ProcessMonitoringCaller): Promise<ProcessMonitorView[]> {
    return this.repository.listByDestination(caller.clientId, caller.product);
  }

  async movements(caller: ProcessMonitoringCaller, id: string): Promise<ProcessMovementView[]> {
    await this.get(caller, id);
    return this.repository.listMovements(caller.clientId, id);
  }

  /** Historico do processo no destino: retrato inteiro, nao so o que foi detectado depois (Sprint 5). */
  async processMovements(caller: ProcessMonitoringCaller, id: string): Promise<ProcessTimelineMovement[]> {
    await this.get(caller, id);
    const movements = await this.repository.listProcessMovements(caller.clientId, id);
    return movements.map((movement) => ({
      ...movement,
      djenLookup: Boolean(movement.occurredAt) && movementMayHaveCommunication(movement.description)
    }));
  }

  /** Dados do processo do ultimo retrato do DataJud (Sprint 9). */
  async processDetails(caller: ProcessMonitoringCaller, id: string): Promise<ProcessDetailsView | null> {
    await this.get(caller, id);
    return this.repository.findProcessDetails(caller.clientId, id);
  }

  /**
   * "Ver no DJEN" (Sprint 9): busca no DJEN em volta da data da movimentacao, grava como historico e
   * devolve as publicacoes do periodo. Exige a capacidade, mesmo com o DJEN desligado no card.
   */
  async lookupPublications(caller: ProcessMonitoringCaller, id: string, movementId: string): Promise<{ from: string; to: string; items: ProcessPublicationView[] }> {
    await this.get(caller, id);
    await this.capability.requirePublications(caller.clientId);
    const movement = await this.repository.findMovement(caller.clientId, id, movementId);
    if (!movement) throw new NotFoundException('Movimentacao nao encontrada');
    if (!movement.occurredAt) throw new NotFoundException('Movimentacao sem data');
    const monitor = await this.repository.findForLookup(caller.clientId, id);
    if (!monitor) throw new NotFoundException('Acompanhamento nao encontrado');
    const { from, to } = lookupWindow(movement.occurredAt);
    const numeroProcesso = this.crypto.decrypt(caller.clientId, monitor.processNumberCiphertext);
    const items = await this.fetchPublications(caller.clientId, numeroProcesso, from, to);
    await this.repository.saveHistoricalPublications(caller.clientId, id, items);
    const rows = await this.repository.listPublicationsBetween(caller.clientId, id, from, to);
    return { from, to, items: rows.map((row) => this.publicationView(caller.clientId, row)) };
  }

  async pause(caller: ProcessMonitoringCaller, id: string): Promise<ProcessMonitorView> {
    await this.get(caller, id);
    const monitor = await this.repository.setState(caller.clientId, id, 'paused', null);
    if (!monitor) throw new NotFoundException('Acompanhamento nao encontrado');
    await this.workflow.stop(caller.clientId, id, false);
    await this.repository.recordEvent(caller.clientId, id, 'monitor_paused', monitor.destinationProduct);
    return monitor;
  }

  async resume(caller: ProcessMonitoringCaller, id: string): Promise<ProcessMonitorView> {
    await this.capability.require(caller.clientId);
    const current = await this.get(caller, id);
    return this.activate(caller.clientId, current);
  }

  /**
   * Troca a cadencia. O workflow em execucao segue com a cadencia com que foi iniciado ate ser
   * reiniciado (mesmo comportamento anterior do Juridico; pendencia registrada na Sprint 2).
   */
  async setCadence(caller: ProcessMonitoringCaller, id: string, cadence: ProcessMonitorCadence): Promise<ProcessMonitorView> {
    await this.get(caller, id);
    const monitor = await this.repository.setCadence(caller.clientId, id, cadence, nextCheckAt(cadence));
    if (!monitor) throw new NotFoundException('Acompanhamento nao encontrado');
    if (monitor.state === 'active') await this.workflow.start(caller.clientId, id, cadence);
    return monitor;
  }

  async remove(caller: ProcessMonitoringCaller, id: string): Promise<void> {
    const monitor = await this.get(caller, id);
    if (!(await this.repository.markDeleted(caller.clientId, id))) throw new NotFoundException('Acompanhamento nao encontrado');
    await this.repository.recordEvent(caller.clientId, id, 'monitor_deleted', monitor.destinationProduct);
    await this.workflow.stop(caller.clientId, id, true);
  }

  /** Execucao disparada pelo worker (rota interna S2S), idempotente pela chave da activity. */
  async run(clientId: string, id: string, idempotencyKey: string, workflowRunId: string): Promise<ProcessMonitorRunResult> {
    const monitor = await this.repository.findForRun(clientId, id);
    if (!monitor) throw new NotFoundException('Acompanhamento nao encontrado');
    const run = await this.repository.beginRun(clientId, id, idempotencyKey, workflowRunId);
    if (run.alreadyProcessed) return { idempotencyKey, status: 'duplicate', movementsDetected: 0 };
    const numeroProcesso = this.crypto.decrypt(clientId, monitor.processNumberCiphertext);
    const startedAt = Date.now();
    try {
      const response = await this.dataJud.queryProcess({ numeroProcesso, tribunal: monitor.tribunal }, randomUUID(), { background: true });
      const snapshot = snapshotFromResponse(this.hmacKey(), response);
      const newMovements = await this.repository.persistSnapshot(clientId, id, run.id, monitor.destinationProduct, snapshot);
      if (newMovements.length > 0) {
        await this.delivery.deliver(monitor.destinationProduct, {
          clientId,
          monitorId: id,
          requestedByIdentityId: monitor.createdByIdentityId,
          destinationRef: monitor.destinationRef,
          numeroProcesso: maskCnj(numeroProcesso),
          tribunal: snapshot.tribunal,
          processFingerprint: snapshot.processFingerprint,
          newMovements
        });
      }
      await this.repository.completeRun(clientId, { runId: run.id, monitorId: id, status: 'success', latencyMs: Date.now() - startedAt, nextCheckAt: nextCheckAt(monitor.cadence) });
      return { idempotencyKey, status: 'success', movementsDetected: newMovements.length };
    } catch (error) {
      await this.repository.completeRun(clientId, { runId: run.id, monitorId: id, status: runStatusFromError(error), latencyMs: Date.now() - startedAt, nextCheckAt: nextCheckAt(monitor.cadence) });
      throw error;
    }
  }

  /**
   * Plano do ciclo diario (ADR 022): o workflow acorda todo dia util e pergunta quais fontes venceram.
   * Frequencia e liga/desliga valem aqui, sem reiniciar o workflow.
   */
  async plan(clientId: string, id: string, now = Date.now()): Promise<ProcessMonitorPlan> {
    const monitor = await this.repository.findForRun(clientId, id);
    if (!monitor) return { active: false, datajud: false, djen: false };
    const today = todayInBrasilia(now);
    // Capacidade cancelada: o acompanhamento fica, mas o DataJud deixa de ser consultado.
    const datajud = monitor.datajudEnabled
      && (await this.capability.isEnabled(clientId))
      && (!monitor.lastCheckedAt || !monitor.nextCheckAt || dateInBrasilia(monitor.nextCheckAt) <= today);
    const djen = (await this.djenEffective(clientId, monitor))
      && (!monitor.djenNextCheckOn || monitor.djenNextCheckOn <= today);
    return { active: true, datajud, djen };
  }

  /** DJEN vale com a capacidade contratada; `null` = padrao (ligado so para destino Flow). */
  private async djenEffective(clientId: string, monitor: ProcessMonitorView): Promise<boolean> {
    const wanted = monitor.djenEnabled ?? monitor.destinationProduct === 'flow';
    return wanted && (await this.capability.publicationsEnabled(clientId));
  }

  /** Estado efetivo das fontes para a tela do destino. */
  async sources(caller: ProcessMonitoringCaller, monitor: ProcessMonitorView): Promise<{ publicationsAvailable: boolean; djenActive: boolean }> {
    const publicationsAvailable = await this.capability.publicationsEnabled(caller.clientId);
    const wanted = monitor.djenEnabled ?? monitor.destinationProduct === 'flow';
    return { publicationsAvailable, djenActive: publicationsAvailable && wanted && monitor.state === 'active' };
  }

  /**
   * Liga ou desliga uma fonte do acompanhamento (ADR 022). As duas desligadas pausam o acompanhamento;
   * ligar uma fonte de acompanhamento pausado o retoma.
   */
  async setSource(caller: ProcessMonitoringCaller, id: string, source: ProcessMonitorSource, enabled: boolean): Promise<ProcessMonitorView> {
    const current = await this.get(caller, id);
    if (enabled) {
      await this.capability.require(caller.clientId);
      if (source === 'djen') await this.capability.requirePublications(caller.clientId);
    }
    const updated = await this.repository.setSources(
      caller.clientId,
      id,
      source === 'datajud' ? { datajudEnabled: enabled } : { djenEnabled: enabled }
    );
    if (!updated) throw new NotFoundException('Acompanhamento nao encontrado');
    const anyOn = updated.datajudEnabled || (await this.djenEffective(caller.clientId, updated));
    if (!anyOn) {
      if (current.state === 'active') return this.pause(caller, id);
      return updated;
    }
    if (updated.state !== 'active') return this.activate(caller.clientId, updated);
    return updated;
  }

  async setDjenCadence(caller: ProcessMonitoringCaller, id: string, days: DjenCadenceDays): Promise<ProcessMonitorView> {
    await this.get(caller, id);
    const updated = await this.repository.setSources(caller.clientId, id, { djenCadenceDays: days });
    if (!updated) throw new NotFoundException('Acompanhamento nao encontrado');
    return updated;
  }

  /** Publicacoes do DJEN do acompanhamento (so o produto de destino), texto decifrado. */
  async publications(caller: ProcessMonitoringCaller, id: string): Promise<ProcessPublicationView[]> {
    await this.get(caller, id);
    const rows = await this.repository.listPublications(caller.clientId, id);
    return rows.map((row) => this.publicationView(caller.clientId, row));
  }

  private publicationView(clientId: string, row: StoredProcessPublication): ProcessPublicationView {
    return {
      id: row.id,
      availableOn: row.availableOn,
      communicationType: row.communicationType,
      documentType: row.documentType,
      courtName: row.courtName,
      text: row.textCiphertext ? this.crypto.decrypt(clientId, row.textCiphertext) : '',
      link: row.link,
      isNew: row.isNew
    };
  }

  /**
   * Execucao do DJEN disparada pelo worker (fila `process-publications`). Consulta pelo numero do
   * processo desde o ultimo dia consultado (a primeira vez, os ultimos 7 dias, so como base).
   */
  async runPublications(clientId: string, id: string, idempotencyKey: string, workflowRunId: string, now = Date.now()): Promise<{ idempotencyKey: string; status: 'duplicate' | 'success' | 'skipped'; publicationsDetected: number }> {
    const monitor = await this.repository.findForRun(clientId, id);
    if (!monitor) throw new NotFoundException('Acompanhamento nao encontrado');
    if (!(await this.djenEffective(clientId, monitor))) return { idempotencyKey, status: 'skipped', publicationsDetected: 0 };
    const run = await this.repository.beginRun(clientId, id, idempotencyKey, workflowRunId, 'djen');
    if (run.alreadyProcessed) return { idempotencyKey, status: 'duplicate', publicationsDetected: 0 };
    const window = await this.repository.findDjenWindow(clientId, id);
    const today = todayInBrasilia(now);
    const from = window?.checkedUntil ?? addDays(today, -DJEN_BASELINE_DAYS);
    const numeroProcesso = this.crypto.decrypt(clientId, monitor.processNumberCiphertext);
    const startedAt = Date.now();
    try {
      const items = await this.fetchPublications(clientId, numeroProcesso, from, today);
      const created = await this.repository.persistPublications(clientId, id, monitor.destinationProduct, items);
      if (created.length > 0) {
        await this.delivery.deliverPublications(monitor.destinationProduct, {
          clientId,
          monitorId: id,
          requestedByIdentityId: monitor.createdByIdentityId,
          destinationRef: monitor.destinationRef,
          numeroProcesso: maskCnj(numeroProcesso),
          publications: created.map((item) => ({
            id: item.id,
            availableOn: item.availableOn,
            communicationType: item.communicationType,
            documentType: item.documentType,
            courtName: item.courtName,
            excerpt: item.excerpt
          }))
        });
      }
      await this.repository.completeDjenRun(clientId, {
        runId: run.id, monitorId: id, status: 'success', latencyMs: Date.now() - startedAt,
        checkedUntil: today, nextCheckOn: addBusinessDays(today, monitor.djenCadenceDays)
      });
      return { idempotencyKey, status: 'success', publicationsDetected: created.length };
    } catch (error) {
      // Falha nao avanca o periodo nem a proxima data: o proximo ciclo tenta de novo.
      await this.repository.completeDjenRun(clientId, {
        runId: run.id, monitorId: id, status: runStatusFromError(error), latencyMs: Date.now() - startedAt,
        checkedUntil: null, nextCheckOn: null
      });
      throw error;
    }
  }

  private async fetchPublications(clientId: string, numeroProcesso: string, from: string, to: string): Promise<NewProcessPublication[]> {
    const items: NewProcessPublication[] = [];
    for (let page = 1; page <= DJEN_MAX_PAGES; page += 1) {
      const result = await this.dataJud.djenCommunications({
        numeroProcesso,
        dataDisponibilizacaoInicio: from,
        dataDisponibilizacaoFim: to,
        pagina: String(page),
        itensPorPagina: '100'
      });
      for (const item of result.items) {
        const text = publicationText(item.texto);
        items.push({
          providerHash: item.hash.slice(0, 128),
          communicationId: item.comunicacaoId ?? null,
          availableOn: item.dataDisponibilizacao ?? null,
          communicationType: item.tipoComunicacao ?? null,
          documentType: item.tipoDocumento ?? null,
          courtName: item.nomeOrgao ?? null,
          textCiphertext: text ? this.crypto.encrypt(clientId, text) : null,
          encryptionKeyVersion: text ? this.config.juridicoMonitorEncryptionKeyVersion : null,
          link: item.link ?? null,
          excerpt: publicationExcerpt(text)
        });
      }
      if (result.items.length < 100 || page * 100 >= result.count) break;
    }
    return items;
  }

  async purge(): Promise<{ purged: number }> {
    return { purged: await this.repository.purgeExpired() };
  }

  private async reuse(caller: ProcessMonitoringCaller, monitor: ProcessMonitorView, destinationRef: ProcessMonitorDestinationRef): Promise<ProcessMonitorView> {
    if (monitor.destinationProduct !== caller.product || !this.sameDestination(monitor.destinationRef, destinationRef)) {
      throw this.inUse(caller, monitor);
    }
    // Sempre (re)inicia o workflow: retoma o pausado e revive o ativo cujo workflow morreu
    // (o start com o mesmo id e idempotente quando o workflow esta rodando).
    return this.activate(caller.clientId, monitor);
  }

  private inUse(caller: ProcessMonitoringCaller, monitor: ProcessMonitorView): ConflictException {
    return new ConflictException({
      code: 'process_monitor_in_use',
      message: monitor.destinationProduct === 'juridico'
        ? 'Este processo ja e acompanhado no Juridico.'
        : 'Este processo ja e acompanhado no Flow.',
      destinationProduct: monitor.destinationProduct,
      // So o proprio produto recebe a referencia: o Flow nao precisa saber do banco do Juridico.
      destinationRef: monitor.destinationProduct === caller.product ? monitor.destinationRef : null
    });
  }

  private async activate(clientId: string, monitor: ProcessMonitorView): Promise<ProcessMonitorView> {
    const updated = monitor.state === 'active'
      ? monitor
      : await this.repository.setState(clientId, monitor.id, 'active', nextCheckAt(monitor.cadence));
    if (!updated) throw new NotFoundException('Acompanhamento nao encontrado');
    await this.workflow.start(clientId, monitor.id, monitor.cadence);
    return updated;
  }

  private sameDestination(current: ProcessMonitorDestinationRef, requested: ProcessMonitorDestinationRef): boolean {
    const key = (ref: ProcessMonitorDestinationRef) =>
      'cardId' in ref ? `${ref.databaseRef}:${ref.boardId}:${ref.cardId}` : ref.databaseRef;
    return key(current) === key(requested);
  }

  private hmac(processNumber: string): string {
    return processNumberHmac(this.hmacKey(), processNumber);
  }

  private hmacKey(): string {
    if (!this.config.juridicoDataAuditHmacKey) throw new ServiceUnavailableException('Chave do acompanhamento nao configurada');
    return this.config.juridicoDataAuditHmacKey;
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
