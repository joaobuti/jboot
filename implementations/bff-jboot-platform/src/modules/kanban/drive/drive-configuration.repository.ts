import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export type DriveStatus = 'inactive' | 'active' | 'paused' | 'invalid';
export interface DriveConfigurationRow {
  status: DriveStatus; googleAccountEmail: string | null; refreshTokenEnc: Buffer | null;
  rootFolderId: string | null; rootFolderName: string | null; lastErrorCode: string | null;
}

@Injectable()
export class DriveConfigurationRepository {
  constructor(private readonly database: DatabaseService) {}

  async get(databaseRef: string, clientId: string) {
    const result = await this.database.queryForDatabaseRef<DriveConfigurationRow>(databaseRef,
      `SELECT status, google_account_email AS "googleAccountEmail", refresh_token_enc AS "refreshTokenEnc",
              root_folder_id AS "rootFolderId", root_folder_name AS "rootFolderName", last_error_code AS "lastErrorCode"
       FROM kanban_drive_configurations WHERE client_id = $1`, [clientId]);
    return result.rows[0] ?? null;
  }

  /** Nova conexao: a pasta e escolhida de novo, porque o acesso do app a ela e por conta Google. */
  async connect(databaseRef: string, clientId: string, identityId: string, input: { refreshTokenEnc: Buffer; email: string }) {
    await this.database.queryForDatabaseRef(databaseRef,
      `INSERT INTO kanban_drive_configurations (client_id,credential_mode,refresh_token_enc,google_account_email,status,updated_by_identity_id)
       VALUES ($1,'oauth',$2,$3,'inactive',$4)
       ON CONFLICT (client_id) DO UPDATE SET refresh_token_enc=$2,google_account_email=$3,secret_ref=NULL,
         root_folder_id=NULL,root_folder_name=NULL,status='inactive',last_error_code=NULL,updated_by_identity_id=$4,updated_at=now()`,
      [clientId, input.refreshTokenEnc, input.email || null, identityId]);
  }

  async saveFolder(databaseRef: string, clientId: string, identityId: string, input: { rootFolderId: string | null; rootFolderName: string | null; status: DriveStatus }) {
    await this.database.queryForDatabaseRef(databaseRef,
      `UPDATE kanban_drive_configurations SET root_folder_id=$2,root_folder_name=$3,status=$4,last_error_code=NULL,
         updated_by_identity_id=$5,updated_at=now() WHERE client_id=$1`,
      [clientId, input.rootFolderId, input.rootFolderName, input.status, identityId]);
  }

  async disconnect(databaseRef: string, clientId: string, identityId: string) {
    await this.database.queryForDatabaseRef(databaseRef,
      `UPDATE kanban_drive_configurations SET refresh_token_enc=NULL,google_account_email=NULL,root_folder_id=NULL,
         root_folder_name=NULL,status='inactive',last_error_code=NULL,updated_by_identity_id=$2,updated_at=now() WHERE client_id=$1`,
      [clientId, identityId]);
  }
}
