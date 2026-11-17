import { HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { AppConfigService } from '../../../config/app-config.service';
import { JuridicoRequestContext } from '../shared/juridico.types';
import { DataJudMonitorCryptoService } from '../shared/datajud-monitor-crypto.service';
import { PjeDataClientService } from '../pje/pje-data-client.service';
import { DataJudClientService } from '../../shared/juridico-data/datajud-client.service';
import { DataJudAuditStatus, DataJudRepository } from './datajud.repository';
import {
  InternalProcessResponseDto,
  ListProcessesByOabDto,
  ProcessByOabDto,
  ProcessesByOabResponseDto,
  ProcessQueryResponseDto,
  QueryDataJudProcessDto,
  TribunalListDto,
} from './dto/datajud.dto';

const LAG_NOTICE = 'Os dados do DataJud podem apresentar defasagem em relacao ao tribunal de origem.';

@Injectable()
export class DataJudService {
  constructor(
    private readonly client: DataJudClientService,
    private readonly repository: DataJudRepository,
    private readonly config: AppConfigService,
    private readonly crypto: DataJudMonitorCryptoService,
    private readonly djen: PjeDataClientService,
  ) {}

  listTribunals(): Promise<TribunalListDto> {
    return this.client.listTribunals();
  }

  /**
   * Lista os processos de um advogado a partir da OAB.
   *
   * MECANICA (deliberadamente invisivel na interface): o indice do DataJud NAO
   * possui campo de OAB, advogado ou parte — verificado em 2026-09-09 contra
   * `api_publica_tjpr` (14 campos, nenhum de pessoa) e por busca full-text do
   * numero da OAB, que retornou zero resultados. A unica fonte oficial do CNJ
   * que aceita OAB como filtro e o DJEN, entao a listagem vem de la; os
   * detalhes de capa e movimentacao continuam vindo do DataJud, por numero CNJ,
   * via `queryProcess`.
   *
   * A tela nao revela essa composicao por decisao de produto registrada em
   * `docs/product/juridico-datajud-flow-sprints.md` (Sprint 8): para o
   * advogado, e uma consulta so.
   *
   * Este metodo NAO consulta o DataJud. Enriquecer os 25 processos de uma OAB
   * levou 87s na medicao real, o que inviabiliza fazer isso no carregamento da
   * tela; o detalhamento e sob demanda, processo a processo.
   */
  async listProcessesByOab(
    ctx: JuridicoRequestContext,
    query: ListProcessesByOabDto,
  ): Promise<ProcessesByOabResponseDto> {
    const params = new URLSearchParams({
      numeroOab: query.numeroOab.replace(/\D/g, ''),
      ufOab: query.ufOab.toUpperCase(),
      dataDisponibilizacaoInicio: query.dataInicio,
      dataDisponibilizacaoFim: query.dataFim,
      pagina: '1',
      itensPorPagina: '100',
    });
    const page = await this.djen.comunicacoes(params);

    // Um processo costuma ter varias publicacoes no periodo: o advogado quer a
    // lista de processos, nao de publicacoes.
    const byProcess = new Map<string, ProcessByOabDto>();
    for (const item of page.items) {
      const numero = this.text(item.numeroProcesso);
      if (!numero) continue;
      const disponibilizadoEm = this.text(item.dataDisponibilizacao);
      const current = byProcess.get(numero);
      if (!current) {
        byProcess.set(numero, {
          numeroProcesso: numero,
          numeroProcessoMask: this.text(item.numeroProcessoMask) ?? numero,
          tribunal: this.text(item.siglaTribunal),
          orgao: this.text(item.nomeOrgao),
          classe: this.text(item.nomeClasse),
          ultimaPublicacaoEm: disponibilizadoEm,
          publicacoes: 1,
          snapshotId: null,
          consultadoEm: null,
          exportado: false,
          cardUrl: null,
        });
        continue;
      }
      current.publicacoes += 1;
      if (disponibilizadoEm && (!current.ultimaPublicacaoEm || disponibilizadoEm > current.ultimaPublicacaoEm)) {
        current.ultimaPublicacaoEm = disponibilizadoEm;
      }
    }

    // Marca o que ja virou card, para o advogado nao reexportar sem perceber.
    // Sem a chave de auditoria nao ha como calcular o HMAC; nesse caso a lista
    // sai sem a marcacao em vez de falhar.
    if (this.config.juridicoDataAuditHmacKey) {
      const byHmac = new Map<string, ProcessByOabDto>();
      for (const item of byProcess.values()) {
        byHmac.set(this.processHmac(item.numeroProcesso), item);
      }
      const hmacs = [...byHmac.keys()];
      const [exported, snapshots] = await Promise.all([
        this.repository.findExportedByProcessHmac(ctx.clientId, ctx.databaseRef, hmacs),
        this.repository.findSnapshotsByProcessHmac(ctx.clientId, ctx.databaseRef, hmacs),
      ]);
      for (const [hmac, link] of exported) {
        const item = byHmac.get(hmac);
        if (!item) continue;
        item.exportado = true;
        item.cardUrl = `/flow/boards/${link.boardId}?card=${link.cardId}`;
      }
      // Consulta ja gravada: a tela reabre os dados sem custo de provedor, o
      // que importa depois de um reload, quando o estado da sessao se perdeu.
      for (const [hmac, snapshot] of snapshots) {
        const item = byHmac.get(hmac);
        if (!item) continue;
        item.snapshotId = snapshot.snapshotId;
        item.consultadoEm = snapshot.capturedAt;
      }
    }

    const items = [...byProcess.values()].sort((a, b) =>
      (b.ultimaPublicacaoEm ?? '').localeCompare(a.ultimaPublicacaoEm ?? ''),
    );
    return { items, total: items.length, publicacoesAnalisadas: page.items.length };
  }

  /**
   * Reabre uma consulta ja gravada, sem tocar no provedor.
   *
   * O snapshot guarda a capa integral, mas as movimentacoes so com data e
   * descricao — codigo, complementos e vara do movimento nao sao persistidos.
   * Por isso a resposta sinaliza `origem: 'snapshot'`: a tela avisa que sao os
   * dados da consulta anterior, nao uma leitura nova do CNJ.
   */
  async getStoredProcess(
    ctx: JuridicoRequestContext,
    snapshotId: string,
  ): Promise<ProcessQueryResponseDto & { origem: 'snapshot' }> {
    const snapshot = await this.repository.getManualSnapshot(ctx.clientId, ctx.databaseRef, snapshotId);
    if (!snapshot) {
      throw new NotFoundException('Consulta nao encontrada ou ja expirada');
    }
    const movements = await this.repository.listSnapshotMovements(ctx.clientId, ctx.databaseRef, snapshotId);
    const numeroProcesso = this.crypto.decrypt(ctx.clientId, snapshot.processNumberCiphertext);

    return {
      requestId: randomUUID(),
      source: 'datajud',
      capturedAt: new Date(snapshot.capturedAt).toISOString(),
      lagNotice: LAG_NOTICE,
      snapshotId,
      origem: 'snapshot',
      process: {
        numeroProcesso: numeroProcesso.replace(/\D/g, ''),
        tribunal: snapshot.tribunal,
        datajudId: snapshot.datajudId,
        grau: snapshot.grau,
        dataAjuizamento: snapshot.dataAjuizamento,
        dataUltimaAtualizacao: snapshot.providerUpdatedAt,
        sincronizadoEm: snapshot.sincronizadoEm,
        nivelSigilo: 0,
        classe: snapshot.classe as ProcessQueryResponseDto['process']['classe'],
        formato: snapshot.formato as ProcessQueryResponseDto['process']['formato'],
        sistema: snapshot.sistema as ProcessQueryResponseDto['process']['sistema'],
        orgaoJulgador: snapshot.orgaoJulgador as ProcessQueryResponseDto['process']['orgaoJulgador'],
        assuntos: (snapshot.assuntos ?? []) as ProcessQueryResponseDto['process']['assuntos'],
        movimentacoes: movements.map((movement) => ({
          codigo: null,
          nome: movement.description,
          dataHora: movement.occurredAt,
          orgaoJulgador: null,
          complementos: [],
        })),
      },
    };
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  async queryProcess(
    ctx: JuridicoRequestContext,
    body: QueryDataJudProcessDto,
  ): Promise<ProcessQueryResponseDto> {
    if (!this.config.juridicoDataAuditHmacKey) {
      throw new ServiceUnavailableException('Chave de auditoria juridica nao configurada');
    }
    const requestId = randomUUID();
    const startedAt = Date.now();
    let status: DataJudAuditStatus = 'internal_error';
    let providerUpdatedAt: string | null = null;
    let resolvedTribunal = body.tribunal?.toUpperCase() ?? null;
    try {
      const response = await this.client.queryProcess(
        { ...body, tribunal: resolvedTribunal },
        requestId,
      );
      status = 'success';
      providerUpdatedAt = response.process.dataUltimaAtualizacao;
      resolvedTribunal = response.process.tribunal;
      const snapshotId = await this.persistSnapshot(ctx, response);
      return { ...response, lagNotice: LAG_NOTICE, snapshotId };
    } catch (error) {
      status = this.auditStatus(error);
      throw error;
    } finally {
      await this.repository.insertAudit(ctx.clientId, ctx.databaseRef, {
        identityId: ctx.identityId,
        requestId,
        tribunal: resolvedTribunal,
        processNumberHmac: this.processHmac(body.numeroProcesso),
        hmacKeyVersion: this.config.juridicoDataAuditHmacKeyVersion,
        resultStatus: status,
        providerLatencyMs: Date.now() - startedAt,
        providerUpdatedAt,
      });
    }
  }

  /**
   * O snapshot e a origem do export para o Flow e o baseline do monitoramento.
   * Falha ao persistir nao derruba a consulta: o usuario ja tem o resultado, e
   * a proxima consulta reescreve o snapshot. Nesse caso `snapshotId` vem nulo e
   * a UI nao oferece o export.
   */
  private async persistSnapshot(
    ctx: JuridicoRequestContext,
    response: InternalProcessResponseDto,
  ): Promise<string | null> {
    const process = response.process;
    const numeroProcesso = process.numeroProcesso.replace(/\D/g, '');
    try {
      const { snapshotId } = await this.repository.upsertManualSnapshot(ctx.clientId, ctx.databaseRef, {
        processNumberCiphertext: this.crypto.encrypt(ctx.clientId, numeroProcesso),
        encryptionKeyVersion: this.config.juridicoMonitorEncryptionKeyVersion,
        processNumberHmac: this.processHmac(numeroProcesso),
        hmacKeyVersion: this.config.juridicoDataAuditHmacKeyVersion,
        tribunal: process.tribunal,
        processFingerprint: this.processFingerprint(process),
        providerUpdatedAt: process.dataUltimaAtualizacao,
        datajudId: process.datajudId,
        grau: process.grau,
        dataAjuizamento: process.dataAjuizamento,
        sincronizadoEm: process.sincronizadoEm,
        classe: process.classe,
        formato: process.formato,
        sistema: process.sistema,
        orgaoJulgador: process.orgaoJulgador,
        assuntos: process.assuntos,
        retentionDays: this.config.juridicoDataSnapshotRetentionDays,
        movements: process.movimentacoes.map((movement) => ({
          fingerprint: this.movementFingerprint(movement),
          occurredAt: movement.dataHora,
          description: movement.nome,
        })),
      });
      return snapshotId;
    } catch {
      return null;
    }
  }

  private processFingerprint(process: InternalProcessResponseDto['process']): string {
    return createHmac('sha256', this.config.juridicoDataAuditHmacKey)
      .update(
        JSON.stringify({
          tribunal: process.tribunal,
          updatedAt: process.dataUltimaAtualizacao,
          movements: process.movimentacoes,
        }),
      )
      .digest('hex');
  }

  private movementFingerprint(movement: InternalProcessResponseDto['process']['movimentacoes'][number]): string {
    return createHmac('sha256', this.config.juridicoDataAuditHmacKey)
      .update(JSON.stringify([movement.codigo, movement.nome, movement.dataHora, movement.complementos]))
      .digest('hex');
  }

  private processHmac(number: string): string {
    const normalized = number.replace(/\D/g, '');
    return createHmac('sha256', this.config.juridicoDataAuditHmacKey).update(normalized).digest('hex');
  }

  private auditStatus(error: unknown): DataJudAuditStatus {
    if (!(error instanceof HttpException)) return 'internal_error';
    const body = error.getResponse();
    const code = typeof body === 'object' && body !== null && 'code' in body ? String(body.code) : '';
    return {
      process_not_found: 'not_found',
      process_restricted: 'restricted',
      validation_error: 'invalid',
      rate_limited: 'rate_limited',
      juridico_data_timeout: 'timeout',
      juridico_data_unavailable: 'provider_unavailable',
    }[code] as DataJudAuditStatus ?? 'internal_error';
  }
}
