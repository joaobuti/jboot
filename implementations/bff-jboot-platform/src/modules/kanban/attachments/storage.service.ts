import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

const DOWNLOAD_URL_EXPIRES_SECONDS = 300;
const UUID_LENGTH = 36;

/** `{client}/{card}/{activity}/{attachment}-{arquivo}` -> sem o nome do arquivo. */
export function redactStorageKey(key: string): string {
  const segments = key.split('/');
  const last = segments.pop() ?? '';
  return [...segments, last.slice(0, UUID_LENGTH)].join('/');
}

/** `attachment` com nome ASCII seguro (sem aspas/controle) e `filename*` UTF-8 (RFC 6266). */
export function contentDispositionAttachment(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim()
    .slice(0, 150) || 'download';
  const encoded = encodeURIComponent(fileName.slice(0, 150)).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfigService) {
    this.bucket = config.kanbanAttachmentsBucket;
    const credentials = {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey
    };
    this.client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: true,
      credentials
    });
    // Cliente separado, apontando para o endpoint publico: getSignedUrl assina a URL com o
    // host do endpoint configurado no client, e o navegador do usuario precisa conseguir
    // resolver esse host (o hostname interno "minio" da rede docker nao resolve fora dela).
    this.presignClient = new S3Client({
      endpoint: config.s3.publicEndpoint,
      region: config.s3.region,
      forcePathStyle: true,
      credentials
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" criado (kanban-card-attachments)`);
      } catch (error) {
        this.logger.warn(`Nao foi possivel garantir o bucket "${this.bucket}": ${(error as Error).message}`);
      }
    }
  }

  buildStorageKey(params: {
    clientId: string;
    cardId: string;
    activityId: string;
    attachmentId: string;
    fileName: string;
  }): string {
    const safeFileName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${params.clientId}/${params.cardId}/${params.activityId}/${params.attachmentId}-${safeFileName}`;
  }

  /**
   * Modelo de documento (CRM de leads, Sprint 5; ADR 014, Decisao 4): prefixo
   * proprio no bucket do modulo, chave SEM nome de arquivo (o nome original fica
   * so no banco), uma chave por versao (objeto imutavel).
   */
  buildTemplateStorageKey(params: { clientId: string; templateId: string; versionId: string }): string {
    return `${params.clientId}/templates/${params.templateId}/${params.versionId}.docx`;
  }

  /** Kit gerado do cliente (Sprint 4), origem do envio ao Drive: `{client_id}/customers/{customer_id}/kits/{kit_id}.docx`. */
  buildCustomerKitStorageKey(params: { clientId: string; customerId: string; kitId: string }): string {
    return `${params.clientId}/customers/${params.customerId}/kits/${params.kitId}.docx`;
  }

  /** Kit assinado devolvido pelo cliente (flow-signed-kit-sprints.md, S2): versao imutavel, sem nome de arquivo na chave. */
  buildSignedKitStorageKey(params: { clientId: string; customerId: string; kitId: string; signedKitId: string }): string {
    return `${params.clientId}/customers/${params.customerId}/kits/${params.kitId}/signed/${params.signedKitId}`;
  }

  /** Kit do escritorio (contrato de servicos, Sprint 3): `{client_id}/offices/{office_id}/service-contract/{version_id}.docx`. */
  buildOfficeKitStorageKey(params: { clientId: string; officeId: string; versionId: string }): string {
    return `${params.clientId}/offices/${params.officeId}/service-contract/${params.versionId}.docx`;
  }

  /**
   * Documento gerado do lead (CRM de leads, Sprint 6; ADR 014, Decisao 4):
   * `{client_id}/{card_id}/generated/{document_id}.docx` (e `.pdf` do aprovado),
   * sem nome de arquivo na chave; uma chave por documento (objeto imutavel).
   */
  buildGeneratedDocumentKey(params: { clientId: string; cardId: string; documentId: string; format: 'docx' | 'pdf' }): string {
    return `${params.clientId}/${params.cardId}/generated/${params.documentId}.${params.format}`;
  }

  /**
   * Documento da ficha do cliente (ADR 017): chave por versao, SEM nome de
   * arquivo (dado pessoal fica so no banco).
   */
  buildCustomerDocumentKey(params: { clientId: string; customerId: string; documentId: string }): string {
    return `${params.clientId}/customers/${params.customerId}/documents/${params.documentId}`;
  }

  /** Conteudo do objeto (uso interno: modelo na geracao, `.docx` aprovado no PDF). */
  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) {
      throw new Error('storage_object_empty');
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  /** Objeto ja existe? (idempotencia do PDF: nova tentativa nunca grava segundo arquivo). */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode;
      if (status === 404 || (error as { name?: string }).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType
      })
    );
  }

  /**
   * Compensacao de upload: remove o objeto quando a gravacao no banco falha
   * depois do envio. Nunca lanca; a falha fica logada com a chave SEM o nome do
   * arquivo (que pode conter dado pessoal) para saneamento manual.
   */
  async deleteQuietly(key: string): Promise<boolean> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      this.logger.error(
        `storage_compensation_failed bucket=${this.bucket} key=${redactStorageKey(key)}: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * URL assinada de download (5 min). `downloadFileName` define o nome do
   * arquivo salvo pelo navegador quando a chave nao o contem (modelos).
   */
  async getSignedDownloadUrl(
    key: string,
    options: { downloadFileName?: string } = {}
  ): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(
      this.presignClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: options.downloadFileName
          ? contentDispositionAttachment(options.downloadFileName)
          : undefined
      }),
      { expiresIn: DOWNLOAD_URL_EXPIRES_SECONDS }
    );
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_EXPIRES_SECONDS * 1000).toISOString();
    return { url, expiresAt };
  }

  get bucketName(): string {
    return this.bucket;
  }
}
