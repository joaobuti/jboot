import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AppConfigService } from '../../../config/app-config.service';
import { CardsService } from '../../kanban/cards/cards.service';
import { MutateContext } from '../../kanban/kanban.types';
import { ProcessImportRepository } from '../../kanban/process-import/process-import.repository';
import { DataJudRepository } from '../../juridico/datajud/datajud.repository';
import { DataJudMonitorCryptoService } from '../../juridico/shared/datajud-monitor-crypto.service';
import { DomainApplicationContextService } from '../application-context.service';
import { DomainIntegrationRequestContext } from '../domain-integration.types';
import { DomainIntegrationsRepository } from '../domain-integrations.repository';
import { ExportToFlowResponseDto } from '../dto/domain-integration.dto';
import { mapDataJudSnapshotToFlowCard } from '../mappers/flow-card.mapper';

@Injectable()
export class DataJudToFlowExporter {
  private readonly logger = new Logger(DataJudToFlowExporter.name);

  constructor(
    private readonly contexts: DomainApplicationContextService,
    private readonly repository: DomainIntegrationsRepository,
    private readonly cards: CardsService,
    private readonly processOwners: ProcessImportRepository,
    private readonly dataJud: DataJudRepository,
    private readonly crypto: DataJudMonitorCryptoService,
    private readonly config: AppConfigService
  ) {}

  async execute(
    caller: DomainIntegrationRequestContext,
    snapshotId: string,
    boardId: string,
    /** Escritorio do card no Flow: obrigatorio (regra de escritorio da Sprint 3.5). */
    officeId: string,
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ): Promise<ExportToFlowResponseDto> {
    const requestKey = `datajud-snapshot:${snapshotId}:flow:${boardId}`;
    let stage = 'authorize';
    try {
      const juridico = await this.contexts.requireCaller(caller, 'juridico', ['juridico:read']);
      const flow = await this.contexts.requireApplication(caller, 'flow', ['flow:read', 'flow:write']);
      stage = 'load_source';
      const snapshot = await this.dataJud.getManualSnapshot(caller.clientId, juridico.databaseRef, snapshotId);
      if (!snapshot) throw new NotFoundException('Consulta DataJud nao encontrada ou expirada');
      const processNumber = this.crypto.decrypt(caller.clientId, snapshot.processNumberCiphertext);
      const processNumberHmac = this.processHmac(processNumber);
      const operationKey = `datajud:${processNumberHmac}:flow:${boardId}`;
      const movements = await this.dataJud.listSnapshotMovements(caller.clientId, juridico.databaseRef, snapshotId);

      stage = 'check_process';
      // Peticao com o numero registrado ou card importado por planilha ja e o card do processo no Flow:
      // o export DataJud nao cria um segundo. A consulta e no proprio Kanban, porque desde a ADR 021 os
      // cards nascidos no Flow nao gravam vinculo no Juridico.
      const owner = (await this.processOwners.findProcessOwners(flow.databaseRef, caller.clientId, [processNumber.replace(/\D/g, '')]))
        .get(processNumber.replace(/\D/g, ''));
      const petitionCard = owner && owner.kind !== 'datajud_card' ? owner : null;
      if (petitionCard) {
        throw new ConflictException({
          code: 'process_number_in_use',
          message: 'Ja existe um card com este numero do processo.',
          cardId: petitionCard.cardId,
          cardUrl: `/flow/boards/${petitionCard.boardId}?card=${petitionCard.cardId}`
        });
      }

      stage = 'write_destination';
      const result = await this.cards.createInDefaultColumnFromSource(
        flow,
        boardId,
        { ...mapDataJudSnapshotToFlowCard(snapshot, processNumber, movements), officeId },
        { ...flow, ...requestInfo }
      );

      stage = 'write_link';
      await this.repository.registerDataJudExport(juridico.databaseRef, {
        clientId: caller.clientId,
        snapshotId,
        processNumberHmac,
        hmacKeyVersion: this.config.juridicoDataAuditHmacKeyVersion,
        tribunal: snapshot.tribunal,
        boardId,
        cardId: result.card.id,
        flowDatabaseRef: flow.databaseRef,
        exportedByIdentityId: caller.identityId
      });

      stage = 'write_audit';
      await this.repository.insertExportAudit(juridico.databaseRef, {
        clientId: caller.clientId,
        identityId: caller.identityId,
        eventType: 'juridico.datajud.processo.exported_to_flow',
        operationKey,
        payload: {
          snapshotId,
          processNumberHmac,
          tribunal: snapshot.tribunal,
          boardId,
          cardId: result.card.id,
          created: result.created
        },
        ip: requestInfo.ip ?? null
      });
      this.log(operationKey, 'completed', 'complete', result.created);
      return {
        boardId,
        cardId: result.card.id,
        cardUrl: `/flow/boards/${boardId}?card=${result.card.id}`,
        created: result.created
      };
    } catch (error) {
      this.log(requestKey, 'failed', stage);
      throw error;
    }
  }

  private processHmac(processNumber: string): string {
    return createHmac('sha256', this.config.juridicoDataAuditHmacKey)
      .update(processNumber.replace(/\D/g, ''))
      .digest('hex');
  }

  private log(operationKey: string, status: 'completed' | 'failed', stage: string, created?: boolean): void {
    const message = JSON.stringify({ event: 'domain_integration', operationKey, status, stage, created });
    if (status === 'failed') this.logger.error(message);
    else this.logger.log(message);
  }
}
