import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PlatformFileRecord, PlatformFileUsage } from './platform-files.types';

interface PlatformFileRow {
  id: string;
  clientId: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  usage: PlatformFileUsage;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  uploadedByIdentityId: string | null;
  createdAt: string;
}

const COLS = `
  id,
  client_id AS "clientId",
  source_module AS "sourceModule",
  source_entity_type AS "sourceEntityType",
  source_entity_id AS "sourceEntityId",
  usage,
  file_name AS "fileName",
  content_type AS "contentType",
  size_bytes AS "sizeBytes",
  storage_bucket AS "storageBucket",
  storage_key AS "storageKey",
  uploaded_by_identity_id AS "uploadedByIdentityId",
  created_at AS "createdAt"
`;

@Injectable()
export class PlatformFilesRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(params: {
    id: string;
    clientId: string;
    sourceModule: string;
    sourceEntityType: string;
    sourceEntityId: string;
    usage: PlatformFileUsage;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    storageBucket: string;
    storageKey: string;
    uploadedByIdentityId?: string;
  }): Promise<PlatformFileRecord> {
    const result = await this.database.query<PlatformFileRow>(
      `INSERT INTO platform_files (
         id, client_id, source_module, source_entity_type, source_entity_id, usage,
         file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id
       )
       VALUES ($1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, $12::uuid)
       RETURNING ${COLS}`,
      [
        params.id,
        params.clientId,
        params.sourceModule,
        params.sourceEntityType,
        params.sourceEntityId,
        params.usage,
        params.fileName,
        params.contentType,
        params.sizeBytes,
        params.storageBucket,
        params.storageKey,
        params.uploadedByIdentityId ?? null
      ]
    );
    return result.rows[0];
  }

  async findById(clientId: string, fileId: string): Promise<PlatformFileRecord | null> {
    const result = await this.database.query<PlatformFileRow>(
      `SELECT ${COLS}
       FROM platform_files
       WHERE client_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      [clientId, fileId]
    );
    return result.rows[0] ?? null;
  }

  async findByIds(clientId: string, fileIds: string[]): Promise<PlatformFileRecord[]> {
    if (fileIds.length === 0) return [];
    const result = await this.database.query<PlatformFileRow>(
      `SELECT ${COLS}
       FROM platform_files
       WHERE client_id = $1::uuid AND id = ANY($2::uuid[])`,
      [clientId, fileIds]
    );
    return result.rows;
  }
}
