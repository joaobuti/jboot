import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService } from '../attachments/storage.service';
import { ScheduledAutomationRepository } from '../automation/scheduled-automation.repository';
import { DOCUMENT_SYNC_PORT, DocumentSyncPort } from './document-sync.port';
import { DocumentSyncQueueService, DriveSyncPayload } from './document-sync-queue.service';
import { ClaimedSync, DocumentSyncRepository, MAX_SYNC_ATTEMPTS, SyncSource } from './document-sync.repository';
import { CustomersService } from '../../establishment-customers/customers.service';
import { DriveTokenCipher } from './drive-token-cipher.service';

@Injectable()
export class DocumentSyncService {
  private readonly logger = new Logger(DocumentSyncService.name);

  constructor(
    private readonly repo: DocumentSyncRepository,
    private readonly storage: StorageService,
    @Inject(DOCUMENT_SYNC_PORT) private readonly adapter: DocumentSyncPort,
    private readonly queue: DocumentSyncQueueService,
    private readonly tenants: ScheduledAutomationRepository,
    private readonly cipher: DriveTokenCipher,
    private readonly customers: CustomersService
  ) {}

  async process(payload: DriveSyncPayload) {
    const row = await this.repo.claim(payload.databaseRef, payload.clientId, payload.syncId);
    if (!row) return 'skipped';

    try {
      if (row.removeRequested) return await this.remove(payload, row);
      const source = await this.repo.source(payload.databaseRef, payload.clientId, row);
      if (!source) throw new PermanentSyncError('source_missing');
      const body = await this.storage.download(source.storageKey);
      if (createHash('sha256').update(body).digest('hex') !== row.checksum) {
        throw new PermanentSyncError('source_integrity_mismatch');
      }
      const customer = source.customerId ? await this.customers.findForFlowById(payload.clientId, source.customerId) : null;
      const location = driveLocation(
        payload.clientId,
        row,
        source,
        customer ? { documentNumber: customer.documentNumber ?? null, name: customer.name ?? null } : null
      );
      // Um envio por vez por cliente (tambem entre instancias): dois envios paralelos procuravam a mesma
      // pasta, nao achavam e criavam duas (correcao de 2026-10-30).
      const result = await this.repo.withClientDriveLock(payload.databaseRef, payload.clientId, () => this.adapter.upload({
        refreshToken: this.cipher.decrypt(payload.clientId, row.refreshTokenEnc),
        rootFolderId: row.rootFolderId,
        pathSegments: location.pathSegments,
        fileName: location.fileName,
        contentType: source.contentType,
        body,
        checksum: row.checksum,
        idempotencyKey: row.id,
        remoteFileId: row.remoteFileId
      }));
      // Reserva perdida no meio do envio (vencida ou tomada por outro worker): outro resultado vale.
      return (await this.repo.complete(payload.databaseRef, payload.clientId, payload.syncId, row, result)) ? 'synced' : 'skipped';
    } catch (error) {
      const providerCode = (error as { response?: { code?: string } }).response?.code;
      const revoked = providerCode === 'drive_oauth_invalid';
      const forbidden = providerCode === 'drive_delete_forbidden';
      const code = error instanceof PermanentSyncError ? error.message : revoked || forbidden ? providerCode : 'drive_sync_failed';
      // Credencial revogada nao e falha do documento: pausa a integracao e retoma apos reconectar.
      if (revoked) await this.repo.markConfigInvalid(payload.databaseRef, payload.clientId, code);
      // Drive sem permissao para apagar o arquivo: repetir nao muda; fica com falha na fila do Drive.
      const final = !revoked && (forbidden || error instanceof PermanentSyncError || row.attemptCount >= MAX_SYNC_ATTEMPTS);
      if (!(await this.repo.fail(payload.databaseRef, payload.clientId, payload.syncId, row, code, final))) return 'skipped';
      this.logger.warn(`drive_sync_${final ? 'failed' : 'retry'} client=${payload.clientId} sync=${payload.syncId} code=${code}`);
      return final ? 'failed' : 'retry_scheduled';
    }
  }

  /**
   * Documento avulso removido no Flow (D1): envio que nunca chegou ao Drive sai sem chamar o Drive;
   * arquivo enviado vai para a lixeira; arquivo que ja nao existe conta como removido.
   */
  private async remove(payload: DriveSyncPayload, row: ClaimedSync) {
    if (row.remoteFileId) {
      await this.adapter.trash({ refreshToken: this.cipher.decrypt(payload.clientId, row.refreshTokenEnc), remoteFileId: row.remoteFileId });
    }
    return (await this.repo.markRemoved(payload.databaseRef, payload.clientId, payload.syncId, row)) ? 'removed' : 'skipped';
  }

  async sweep() {
    let count = 0;
    for (const tenant of await this.tenants.listActiveFlowTenants()) {
      const reconciled = await this.repo.reconcileMissing(tenant.databaseRef, tenant.clientId);
      let replicaDrift = 0;
      for (const candidate of await this.repo.syncedCandidates(tenant.databaseRef, tenant.clientId)) {
        try {
          const remote = await this.adapter.inspect({
            refreshToken: this.cipher.decrypt(tenant.clientId, candidate.refreshTokenEnc),
            remoteFileId: candidate.remoteFileId
          });
          if (!remote || remote.checksum !== candidate.checksum) {
            await this.repo.requeueReplica(tenant.databaseRef, tenant.clientId, candidate.id, 'remote_replica_drift');
            replicaDrift += 1;
          } else {
            await this.repo.markReconciled(tenant.databaseRef, tenant.clientId, candidate.id);
          }
        } catch {
          await this.repo.markReconciled(tenant.databaseRef, tenant.clientId, candidate.id);
          this.logger.warn(`drive_reconciliation_retry client=${tenant.clientId} sync=${candidate.id}`);
        }
      }
      let tenantEnqueued = 0;
      for (const syncId of await this.repo.stale(tenant.databaseRef, tenant.clientId)) {
        await this.queue.enqueue({ ...tenant, syncId });
        count += 1;
        tenantEnqueued += 1;
      }
      this.logger.log(`drive_sync_sweep client=${tenant.clientId} outbox_reconciled=${reconciled} replica_drift=${replicaDrift} enqueued=${tenantEnqueued}`);
    }
    return count;
  }

  operations(payload: Pick<DriveSyncPayload, 'databaseRef' | 'clientId'>) {
    return this.repo.operations(payload.databaseRef, payload.clientId);
  }

  async reprocess(payload: DriveSyncPayload) {
    if (!await this.repo.reprocess(payload.databaseRef, payload.clientId, payload.syncId)) {
      throw new NotFoundException({ code: 'document_sync_not_found', message: 'Document sync not found' });
    }
    await this.queue.enqueue(payload);
    return { accepted: true };
  }
}

class PermanentSyncError extends Error {}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

/** Pasta sem sinal de quebra de busca/caminho no Drive: sem aspas, barras e controles; espacos colapsados. */
export function driveFolderName(value: string): string {
  return value.replace(/[\\/'"\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export const NO_OFFICE_FOLDER = 'Sem escritorio';

/**
 * Caminho no Drive (ADR 019, decisao 17, 2026-10-26): pasta raiz -> pasta do ESCRITORIO -> pasta do
 * cliente `CPF - NOME`. Desde 2026-10-30 cada pasta e achada pelo nome exato (pedido do usuario): cliente
 * renomeado ganha pasta nova. Peticao sem cliente com CPF continua no caminho tecnico legado.
 */
export function driveLocation(
  clientId: string,
  sync: Pick<ClaimedSync, 'sourceType' | 'documentId' | 'documentVersion'>,
  source: SyncSource,
  customer: { documentNumber: string | null; name: string | null } | null
): { pathSegments: string[]; fileName: string } {
  const digits = customer?.documentNumber?.replace(/\D/g, '') ?? '';
  const cpf = digits.length === 11 || digits.length === 14 ? digits : null;
  const extension = EXTENSIONS[source.contentType] ?? 'bin';
  const office = driveFolderName(source.officeName ?? '') || NO_OFFICE_FOLDER;
  const customerFolder = cpf ? driveFolderName(customer?.name ? `${cpf} - ${customer.name}` : cpf) : null;
  if (sync.sourceType === 'office_kit') {
    return { pathSegments: [office, customerFolder ?? `cliente-${source.customerId ?? 'sem-id'}`], fileName: source.fileName ?? `kit-${sync.documentId}.${extension}` };
  }
  if (sync.sourceType === 'signed_kit') {
    // Ao lado do kit original: mesmo nome, com _ASSINADO e a extensao do arquivo enviado.
    const base = (source.fileName ?? `KIT_${sync.documentId}`).replace(/\.docx$/i, '');
    return { pathSegments: [office, customerFolder ?? `cliente-${source.customerId ?? 'sem-id'}`], fileName: `${base}_ASSINADO.${extension}` };
  }
  if (sync.sourceType === 'card_extra_document') {
    // Avulso: nome enviado + 8 primeiros do id, para dois avulsos com o mesmo nome nao se substituirem.
    const original = source.fileName ?? `documento.${extension}`;
    const dot = original.lastIndexOf('.');
    const base = (dot > 0 ? original.slice(0, dot) : original).trim() || 'documento';
    const fileName = `${base} (${sync.documentId.slice(0, 8)})${dot > 0 ? original.slice(dot) : `.${extension}`}`;
    if (customerFolder) return { pathSegments: [office, customerFolder], fileName };
    return { pathSegments: [clientId, source.officeId ?? 'legacy', 'unlinked', source.cardId ?? 'sem-card'], fileName };
  }
  if (sync.sourceType === 'customer_document') {
    const name = `${(source.documentType ?? 'documento').replace(/_/g, '-')}-v${sync.documentVersion}.${extension}`;
    return { pathSegments: [office, customerFolder ?? `cliente-${source.customerId ?? 'sem-id'}`], fileName: name };
  }
  if (customerFolder && source.fileName) {
    // Peticao da rotina: nome da peticao em todas as versoes; a versao corrigida atualiza o mesmo arquivo
    // (o gatilho da migration 110 herda o `remote_file_id` da versao anterior ja sincronizada).
    return { pathSegments: [office, customerFolder], fileName: source.fileName };
  }
  if (customerFolder) return { pathSegments: [office, customerFolder], fileName: `peticao-${sync.documentId}-v${sync.documentVersion}.${extension}` };
  return {
    pathSegments: [clientId, source.officeId ?? 'legacy', source.customerId ?? 'unlinked', source.cardId ?? 'sem-card'],
    fileName: `${sync.documentId}-v${sync.documentVersion}.${extension}`
  };
}
