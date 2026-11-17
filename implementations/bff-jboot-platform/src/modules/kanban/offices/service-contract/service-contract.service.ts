import { HttpException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../../database/database.service';
import { UploadedFile } from '../../attachments/attachments.service';
import { StorageService } from '../../attachments/storage.service';
import { DOCX_CONTENT_TYPE } from '../../document-templates/docx-package';
import { assertTemplateFileAllowed } from '../../document-templates/document-templates.service';
import { TemplateValidationRunner } from '../../document-templates/template-validation-runner.service';
import { KanbanRequestContext, MutateContext } from '../../kanban.types';
import { KanbanAuditService } from '../../shared/kanban-audit.service';
import { OfficesRepository } from '../offices.repository';
import {
  ServiceContractDownloadDto,
  ServiceContractDto,
  ServiceContractVersionDto,
  ServiceContractVersionSummaryDto,
  UploadServiceContractResponseDto
} from './dto/service-contract.dto';
import { extractServiceContractTags } from './service-contract-content';
import { ServiceContractRepository, ServiceContractVersionRow, ServiceContractVersionSummary } from './service-contract.repository';

/**
 * Contrato de servicos do escritorio (docs/product/flow-office-service-contract-sprints.md): um modelo
 * por escritorio, versionado. Desde a Sprint 3 o modelo e o `.docx` do escritorio (ADR 019, decisao 14);
 * as versoes HTML do editor Quill (Sprint 1) ficam so como historico. Somente `flow:admin` (scope no
 * controller); escritorio de outro tenant responde 404.
 */
@Injectable()
export class ServiceContractService {
  private readonly logger = new Logger(ServiceContractService.name);

  constructor(
    private readonly repository: ServiceContractRepository,
    private readonly offices: OfficesRepository,
    private readonly audit: KanbanAuditService,
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly runner: TemplateValidationRunner
  ) {}

  async get(context: KanbanRequestContext, officeId: string): Promise<ServiceContractDto> {
    const office = await this.requireOffice(context, officeId);
    const [current, versions] = await Promise.all([
      this.repository.current(context.databaseRef, context.clientId, officeId),
      this.repository.listVersions(context.databaseRef, context.clientId, officeId)
    ]);
    return this.toDto(office.id, office.name, current, versions);
  }

  async getVersion(context: KanbanRequestContext, officeId: string, version: number): Promise<ServiceContractVersionDto> {
    await this.requireOffice(context, officeId);
    const row = await this.requireVersion(context, officeId, version);
    const names = await this.identityNames([row.createdByIdentityId]);
    return this.versionDto(row, names);
  }

  /**
   * Envio do `.docx` (falha fechada): escritorio do tenant -> regras de arquivo (tipo, extensao,
   * tamanho) -> analise na worker thread (zip bomb, macro, OLE, vinculo externo, blocos, linha-molde)
   * -> objeto no storage -> versao numa transacao. Arquivo igual ao atual nao cria versao; falha ao
   * gravar ou arquivo repetido remove o objeto enviado.
   */
  async upload(
    context: KanbanRequestContext,
    mutate: MutateContext,
    officeId: string,
    file: UploadedFile | undefined
  ): Promise<UploadServiceContractResponseDto> {
    const office = await this.requireOffice(context, officeId);
    const allowed = assertTemplateFileAllowed(file);
    const outcome = await this.runner.analyzeOfficeKit(allowed.buffer);
    if (!outcome.ok) {
      this.logger.warn(`service_contract_upload_rejected client=${context.clientId} office=${officeId} code=${outcome.code}`);
      throw new HttpException({ code: outcome.code, message: outcome.message, ...outcome.details }, outcome.status);
    }
    const id = randomUUID();
    const storageKey = this.storage.buildOfficeKitStorageKey({ clientId: context.clientId, officeId, versionId: id });
    await this.storage.upload(storageKey, allowed.buffer, DOCX_CONTENT_TYPE);
    let saved: { row: ServiceContractVersionRow; created: boolean };
    try {
      const { tags, invalidTags, blocks, loanRowTags, marks, warnings } = outcome;
      saved = await this.repository.saveDocxIfChanged(context.databaseRef, context.clientId, officeId, {
        id,
        storageKey,
        fileName: allowed.originalname.slice(0, 255),
        sizeBytes: allowed.size,
        tags,
        analysis: { invalidTags, blocks, loanRowTags, marks, warnings },
        contentSha256: outcome.sha256,
        identityId: context.identityId
      });
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
    if (!saved.created) {
      await this.storage.deleteQuietly(storageKey);
    } else {
      await this.audit.record('kanban_office_service_contract_saved', mutate, null, {
        officeId,
        version: saved.row.version,
        format: 'docx',
        tagCount: saved.row.tags.length,
        unrecognizedMarkCount: outcome.marks.unrecognized.length,
        sha256: outcome.sha256
      });
    }
    const result = await this.get(context, officeId);
    return { ...result, officeName: office.name, created: saved.created };
  }

  /** URL assinada do `.docx` da versao; versao HTML (historico) nao tem arquivo. */
  async download(context: KanbanRequestContext, officeId: string, version: number): Promise<ServiceContractDownloadDto> {
    await this.requireOffice(context, officeId);
    const row = await this.requireVersion(context, officeId, version);
    if (row.format !== 'docx' || !row.storageKey) {
      throw new UnprocessableEntityException({ code: 'service_contract_version_without_file', message: 'This version has no .docx file' });
    }
    return this.storage.getSignedDownloadUrl(row.storageKey, { downloadFileName: row.fileName ?? `contrato-servicos-v${row.version}.docx` });
  }

  private async requireOffice(context: KanbanRequestContext, officeId: string) {
    const office = await this.offices.findById(context.databaseRef, context.clientId, officeId);
    if (!office) {
      throw new NotFoundException({ code: 'office_not_found', message: 'Office not found' });
    }
    return office;
  }

  private async requireVersion(context: KanbanRequestContext, officeId: string, version: number) {
    const row = await this.repository.findVersion(context.databaseRef, context.clientId, officeId, version);
    if (!row) {
      throw new NotFoundException({ code: 'service_contract_version_not_found', message: 'Service contract version not found' });
    }
    return row;
  }

  private async toDto(
    officeId: string,
    officeName: string,
    current: ServiceContractVersionRow | null,
    versions: ServiceContractVersionSummary[]
  ): Promise<ServiceContractDto> {
    const names = await this.identityNames(versions.map((item) => item.createdByIdentityId));
    return {
      officeId,
      officeName,
      current: current ? this.versionDto(current, names) : null,
      versions: versions.map((item) => this.summaryDto(item, names))
    };
  }

  private summaryDto(row: ServiceContractVersionSummary, names: Map<string, string>): ServiceContractVersionSummaryDto {
    return {
      version: row.version,
      format: row.format,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      tags: row.tags,
      createdAt: row.createdAt,
      createdByName: names.get(row.createdByIdentityId) ?? null
    };
  }

  private versionDto(row: ServiceContractVersionRow, names: Map<string, string>): ServiceContractVersionDto {
    const analysis = row.analysis;
    return {
      ...this.summaryDto(row, names),
      contentHtml: row.contentHtml,
      invalidTags: analysis?.invalidTags ?? (row.contentHtml ? extractServiceContractTags(row.contentHtml).invalidTags : []),
      blocks: analysis?.blocks ?? [],
      loanRowTags: analysis?.loanRowTags ?? [],
      marks: analysis?.marks ?? null,
      warnings: analysis?.warnings ?? []
    };
  }

  // Identidades vivem em jboot_identity (mesmo padrao de members.repository.ts).
  private async identityNames(identityIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(identityIds)];
    if (unique.length === 0) return new Map();
    const result = await this.database.queryIdentity<{ id: string; displayName: string | null }>(
      `SELECT id, display_name AS "displayName" FROM identities WHERE id = ANY($1::uuid[])`,
      [unique]
    );
    return new Map(result.rows.filter((row) => row.displayName).map((row) => [row.id, row.displayName as string]));
  }
}
