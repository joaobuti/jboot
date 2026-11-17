import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

const DOWNLOAD_URL_EXPIRES_SECONDS = 300;

@Injectable()
export class PlatformFilesStorage implements OnModuleInit {
  private readonly logger = new Logger(PlatformFilesStorage.name);
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfigService) {
    this.bucket = config.platformFilesBucket;
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
        this.logger.log(`Bucket "${this.bucket}" criado (platform-files)`);
      } catch (error) {
        this.logger.warn(`Nao foi possivel garantir o bucket "${this.bucket}": ${(error as Error).message}`);
      }
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

  async getSignedDownloadUrl(key: string): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_EXPIRES_SECONDS }
    );
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_EXPIRES_SECONDS * 1000).toISOString();
    return { url, expiresAt };
  }

  get bucketName(): string {
    return this.bucket;
  }
}
