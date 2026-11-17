import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
  UnsupportedMediaTypeException
} from '@nestjs/common';
import { assertAttachmentFileAllowed, UploadedFile } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { FlowCustomersService } from '../flow-customers/flow-customers.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import {
  CUSTOMER_DOCUMENT_CONTENT_TYPES,
  CUSTOMER_DOCUMENT_LABELS,
  CUSTOMER_DOCUMENT_TYPES,
  CustomerDocumentRequirements,
  CustomerDocumentType,
  EXTRACT_ALTERNATIVES,
  isCustomerDocumentType,
  missingCustomerDocumentTypes,
  requiredCustomerDocumentTypes
} from './customer-document-catalog';
import { CustomerValidationRepository, ValidationFinding, ValidationRunRow } from '../customer-validation/customer-validation.repository';
import { FlowLiveEvents } from '../realtime/flow-live-events';
import { DocumentRasterizerService } from '../customer-validation/document-rasterizer.service';
import { CustomerDocumentRow, CustomerDocumentsRepository } from './customer-documents.repository';

export interface CustomerDocumentView {
  id: string;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByIdentityId: string;
  uploadedAt: string;
}

/**
 * Situacao do arquivo atual no ultimo parecer da IA. So existe quando o parecer leu
 * exatamente este arquivo; nova versao enviada depois volta a "Enviado".
 */
export interface CustomerDocumentReview {
  /** `nao_conferido`: o arquivo estava na ficha, mas nao foi liberado para a rotina (ADR 019). */
  outcome: 'aprovado' | 'recusado' | 'nao_conferido';
  status: ValidationFinding['status'] | null;
  note: string;
  answeredAt: string;
  /** Uma pessoa ja confirmou o parecer. */
  confirmed: boolean;
}

export interface CustomerDocumentsResponse {
  customerId: string;
  residenceProofThirdParty: boolean;
  cpfOnIdentity: boolean;
  /** Todos os documentos exigidos enviados: condicao para "Validar dados" (S2). */
  complete: boolean;
  missing: CustomerDocumentType[];
  items: Array<{
    type: CustomerDocumentType;
    label: string;
    /** Exigido sozinho para validar. HISCON e Promobank nao sao: valem pelo `oneOf`. */
    required: boolean;
    /** `extrato`: HISCON ou Promobank, um dos dois para validar. */
    oneOf: 'extrato' | null;
    current: CustomerDocumentView | null;
    review: CustomerDocumentReview | null;
  }>;
}

@Injectable()
export class CustomerDocumentsService {
  constructor(
    private readonly repository: CustomerDocumentsRepository,
    private readonly customers: FlowCustomersService,
    private readonly storage: StorageService,
    private readonly audit: KanbanAuditService,
    private readonly rasterizer: DocumentRasterizerService,
    private readonly validations: CustomerValidationRepository,
    // Tempo real (R1): o selo "SEM HISCON" dos cards do cliente muda com o envio ou a remocao.
    @Optional() private readonly live?: FlowLiveEvents
  ) {}

  async list(context: KanbanRequestContext, customerId: string, mutate: MutateContext): Promise<CustomerDocumentsResponse> {
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    return this.load(context, customerId);
  }

  async upload(
    context: KanbanRequestContext,
    customerId: string,
    type: string,
    file: UploadedFile | undefined,
    mutate: MutateContext
  ): Promise<CustomerDocumentsResponse> {
    const documentType = requireType(type);
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    // Mesma validacao dos anexos do Flow (tamanho, allowlist, assinatura), restrita
    // aos formatos que o agente consegue ler.
    const allowed = assertAttachmentFileAllowed(file);
    if (!CUSTOMER_DOCUMENT_CONTENT_TYPES.has(allowed.mimetype)) {
      throw new UnsupportedMediaTypeException({
        code: 'content_type_not_allowed',
        message: 'Customer documents accept only PDF, PNG, JPEG or WebP'
      });
    }
    if (allowed.mimetype === 'application/pdf') {
      // PDF com senha ou corrompido nunca chega ao agente: recusa ja no envio.
      const rejection = await this.rasterizer.inspectPdf(allowed.buffer);
      if (rejection === 'password_protected') {
        throw new UnprocessableEntityException({
          code: 'customer_document_password_protected',
          message: 'PDF com senha nao e aceito. Envie o arquivo sem senha.'
        });
      }
      if (rejection === 'unreadable') {
        throw new UnprocessableEntityException({
          code: 'customer_document_unreadable',
          message: 'Nao foi possivel abrir o PDF. Envie outro arquivo.'
        });
      }
    }
    const id = randomUUID();
    const storageKey = this.storage.buildCustomerDocumentKey({ clientId: context.clientId, customerId, documentId: id });
    await this.storage.upload(storageKey, allowed.buffer, allowed.mimetype);
    let created: CustomerDocumentRow;
    try {
      created = await this.repository.createVersion(context.databaseRef, context.clientId, {
        id,
        customerId,
        documentType,
        fileName: allowed.originalname.slice(0, 255),
        contentType: allowed.mimetype,
        sizeBytes: allowed.size,
        sha256: createHash('sha256').update(allowed.buffer).digest('hex'),
        storageBucket: this.storage.bucketName,
        storageKey,
        identityId: context.identityId
      });
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
    await this.audit.record('kanban_flow_customer_document_uploaded', mutate, null, {
      customerId,
      documentType,
      version: created.version
    });
    this.live?.customerChanged(context.databaseRef, context.clientId, customerId, 'customer.document_uploaded');
    return this.load(context, customerId);
  }

  async remove(context: KanbanRequestContext, customerId: string, type: string, mutate: MutateContext) {
    const documentType = requireType(type);
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    const removed = await this.repository.removeCurrent(
      context.databaseRef,
      context.clientId,
      customerId,
      documentType,
      context.identityId
    );
    if (!removed) throw new NotFoundException({ code: 'customer_document_not_found', message: 'Document not found' });
    await this.audit.record('kanban_flow_customer_document_removed', mutate, null, {
      customerId,
      documentType,
      version: removed.version
    });
    this.live?.customerChanged(context.databaseRef, context.clientId, customerId, 'customer.document_removed');
    return this.load(context, customerId);
  }

  async updateProfile(
    context: KanbanRequestContext,
    customerId: string,
    patch: Partial<CustomerDocumentRequirements>,
    mutate: MutateContext
  ) {
    const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) {
      throw new UnprocessableEntityException({ code: 'customer_document_profile_empty', message: 'Nothing to update' });
    }
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    await this.repository.updateProfile(context.databaseRef, context.clientId, customerId, changes, context.identityId);
    await this.audit.record('kanban_flow_customer_document_profile_updated', mutate, null, { customerId, ...changes });
    return this.load(context, customerId);
  }

  async download(context: KanbanRequestContext, customerId: string, documentId: string, mutate: MutateContext) {
    await this.customers.requireVisibleCustomer(context, customerId, mutate);
    const document = await this.repository.findById(context.databaseRef, context.clientId, customerId, documentId);
    if (!document) throw new NotFoundException({ code: 'customer_document_not_found', message: 'Document not found' });
    return this.storage.getSignedDownloadUrl(document.storageKey, { downloadFileName: document.fileName });
  }

  private async load(context: KanbanRequestContext, customerId: string): Promise<CustomerDocumentsResponse> {
    const [rows, requirements, answered] = await Promise.all([
      this.repository.listCurrent(context.databaseRef, context.clientId, customerId),
      this.repository.getProfile(context.databaseRef, context.clientId, customerId),
      this.validations.latestAnswered(context.databaseRef, context.clientId, customerId)
    ]);
    return buildCustomerDocumentsResponse(customerId, rows, requirements, answered);
  }
}

export function buildCustomerDocumentsResponse(
  customerId: string,
  rows: CustomerDocumentRow[],
  requirements: CustomerDocumentRequirements,
  answered: ValidationRunRow | null = null
): CustomerDocumentsResponse {
  const byType = new Map(rows.map((row) => [row.documentType, row]));
  const required = new Set(requiredCustomerDocumentTypes(requirements));
  const missing = missingCustomerDocumentTypes(new Set(byType.keys()), requirements);
  return {
    customerId,
    residenceProofThirdParty: requirements.residenceProofThirdParty,
    cpfOnIdentity: requirements.cpfOnIdentity,
    complete: missing.length === 0,
    missing,
    items: CUSTOMER_DOCUMENT_TYPES.map((type) => {
      const row = byType.get(type);
      return {
        type,
        label: CUSTOMER_DOCUMENT_LABELS[type],
        required: required.has(type),
        oneOf: EXTRACT_ALTERNATIVES.includes(type) ? 'extrato' : null,
        current: row
          ? {
              id: row.id,
              version: row.version,
              fileName: row.fileName,
              contentType: row.contentType,
              sizeBytes: row.sizeBytes,
              uploadedByIdentityId: row.uploadedByIdentityId,
              uploadedAt: row.createdAt
            }
          : null,
        review: row ? documentReview(answered, type, row.id) : null
      };
    })
  };
}

function documentReview(run: ValidationRunRow | null, type: CustomerDocumentType, documentId: string): CustomerDocumentReview | null {
  if (!run?.answeredAt || !run.findings) return null;
  const inRun = run.documentsSnapshot.some((item) => item.type === type && item.documentId === documentId);
  if (!inRun) return null;
  if (run.readableDocumentTypes && !run.readableDocumentTypes.includes(type)) {
    return { outcome: 'nao_conferido', status: null, note: '', answeredAt: run.answeredAt, confirmed: run.confirmedAt !== null };
  }
  const finding = run.findings.find((item) => item.documentType === type);
  if (!finding) return null;
  return {
    outcome: finding.status === 'ok' ? 'aprovado' : 'recusado',
    status: finding.status,
    note: finding.note,
    answeredAt: run.answeredAt,
    confirmed: run.confirmedAt !== null
  };
}

function requireType(value: string): CustomerDocumentType {
  if (!isCustomerDocumentType(value)) {
    throw new BadRequestException({ code: 'customer_document_type_invalid', message: 'Unknown document type' });
  }
  return value;
}
