import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from '@nestjs/common';
import { PlatformFilesRepository } from './platform-files.repository';
import { PlatformFilesStorage } from './platform-files.storage';
import { PlatformFileOrigin, PlatformFileRecord, PlatformFileUsage, PlatformUploadedFile, SignedFileUrl } from './platform-files.types';

interface UsagePolicy {
  maxSizeBytes: number;
  contentTypes: ReadonlySet<string>;
}

const USAGE_POLICIES: Record<PlatformFileUsage, UsagePolicy> = {
  product_image: {
    maxSizeBytes: 5 * 1024 * 1024,
    contentTypes: new Set(['image/png', 'image/jpeg', 'image/webp'])
  }
};

const ORIGIN_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;

@Injectable()
export class PlatformFilesService {
  constructor(
    private readonly repository: PlatformFilesRepository,
    private readonly storage: PlatformFilesStorage
  ) {}

  async upload(origin: PlatformFileOrigin, file: PlatformUploadedFile | undefined): Promise<PlatformFileRecord> {
    this.assertOrigin(origin);
    this.assertFile(origin.usage, file);

    const fileId = randomUUID();
    const storageKey = this.buildStorageKey(origin, fileId, file.originalname);

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    return this.repository.create({
      id: fileId,
      clientId: origin.clientId,
      sourceModule: origin.sourceModule,
      sourceEntityType: origin.sourceEntityType,
      sourceEntityId: origin.sourceEntityId,
      usage: origin.usage,
      fileName: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      storageBucket: this.storage.bucketName,
      storageKey,
      uploadedByIdentityId: origin.uploadedByIdentityId
    });
  }

  async getSignedDownloadUrl(clientId: string, fileId: string): Promise<SignedFileUrl> {
    const file = await this.repository.findById(clientId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return this.storage.getSignedDownloadUrl(file.storageKey);
  }

  async getSignedDownloadUrlMap(clientId: string, fileIds: Array<string | null | undefined>): Promise<Map<string, SignedFileUrl>> {
    const uniqueIds = [...new Set(fileIds.filter((id): id is string => Boolean(id)))];
    const files = await this.repository.findByIds(clientId, uniqueIds);
    const entries = await Promise.all(
      files.map(async (file) => [file.id, await this.storage.getSignedDownloadUrl(file.storageKey)] as const)
    );
    return new Map(entries);
  }

  buildStorageKey(origin: PlatformFileOrigin, fileId: string, fileName: string): string {
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    return [
      origin.clientId,
      origin.sourceModule,
      origin.sourceEntityType,
      origin.sourceEntityId,
      origin.usage,
      `${fileId}-${safeFileName || 'file'}`
    ].join('/');
  }

  private assertOrigin(origin: PlatformFileOrigin): void {
    if (!origin.clientId || !origin.sourceEntityId) {
      throw new BadRequestException({ code: 'file_origin_required', message: 'File origin is required' });
    }
    if (!ORIGIN_PATTERN.test(origin.sourceModule) || !ORIGIN_PATTERN.test(origin.sourceEntityType)) {
      throw new BadRequestException({ code: 'invalid_file_origin', message: 'File origin is invalid' });
    }
    if (!USAGE_POLICIES[origin.usage]) {
      throw new BadRequestException({ code: 'invalid_file_usage', message: 'File usage is invalid' });
    }
  }

  private assertFile(usage: PlatformFileUsage, file: PlatformUploadedFile | undefined): asserts file is PlatformUploadedFile {
    if (!file) {
      throw new BadRequestException({ code: 'file_required', message: 'No file provided' });
    }
    const policy = USAGE_POLICIES[usage];
    if (file.size <= 0 || file.size > policy.maxSizeBytes) {
      throw new PayloadTooLargeException({
        code: 'file_too_large',
        message: `File exceeds the allowed size limit of ${policy.maxSizeBytes} bytes`
      });
    }
    if (!policy.contentTypes.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException({
        code: 'content_type_not_allowed',
        message: `Content type "${file.mimetype}" is not allowed`
      });
    }
  }
}
