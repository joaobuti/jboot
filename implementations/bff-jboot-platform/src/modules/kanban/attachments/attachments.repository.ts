import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ensureOne } from '../shared/repository-result';

export interface CardAttachmentRow {
  id: string;
  activityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  uploadedByIdentityId: string;
  createdAt: string;
}

const ATTACHMENT_SELECT = `id, activity_id AS "activityId", file_name AS "fileName", content_type AS "contentType",
                            size_bytes AS "sizeBytes", storage_bucket AS "storageBucket", storage_key AS "storageKey",
                            uploaded_by_identity_id AS "uploadedByIdentityId", created_at AS "createdAt"`;

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string, activityId: string): Promise<CardAttachmentRow[]> {
    const result = await this.database.queryForDatabaseRef<CardAttachmentRow>(
      databaseRef,
      `SELECT ${ATTACHMENT_SELECT} FROM kanban_card_attachments
       WHERE client_id = $1 AND activity_id = $2
       ORDER BY created_at`,
      [clientId, activityId]
    );
    return result.rows;
  }

  async findById(databaseRef: string, clientId: string, activityId: string, attachmentId: string): Promise<CardAttachmentRow | null> {
    const result = await this.database.queryForDatabaseRef<CardAttachmentRow>(
      databaseRef,
      `SELECT ${ATTACHMENT_SELECT} FROM kanban_card_attachments WHERE client_id = $1 AND activity_id = $2 AND id = $3`,
      [clientId, activityId, attachmentId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    params: {
      id: string;
      activityId: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      storageBucket: string;
      storageKey: string;
      uploadedByIdentityId: string;
    }
  ): Promise<CardAttachmentRow> {
    return ensureOne(
      await this.database.queryForDatabaseRef<CardAttachmentRow>(
        databaseRef,
        `INSERT INTO kanban_card_attachments
           (id, client_id, activity_id, file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${ATTACHMENT_SELECT}`,
        [
          params.id,
          clientId,
          params.activityId,
          params.fileName,
          params.contentType,
          params.sizeBytes,
          params.storageBucket,
          params.storageKey,
          params.uploadedByIdentityId
        ]
      )
    );
  }
}
