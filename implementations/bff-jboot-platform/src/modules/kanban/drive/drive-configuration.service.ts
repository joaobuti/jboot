import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { AppConfigService } from '../../../config/app-config.service';
import { DriveConfigurationRepository } from './drive-configuration.repository';
import { DriveTokenCipher } from './drive-token-cipher.service';
import { DriveConfigurationWriteDto } from './dto/drive-configuration.dto';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';

@Injectable()
export class DriveConfigurationService {
  constructor(
    private readonly repository: DriveConfigurationRepository,
    private readonly oauth: GoogleDriveOAuthService,
    private readonly cipher: DriveTokenCipher,
    private readonly audit: KanbanAuditService,
    private readonly config: AppConfigService
  ) {}

  async get(context: KanbanRequestContext) {
    return this.sanitize(await this.repository.get(context.databaseRef, context.clientId));
  }

  connect(context: KanbanRequestContext, redirectUri: string) {
    this.oauth.assertConfigured();
    this.oauth.assertRedirectUri(redirectUri);
    const state = this.oauth.createState(context.clientId, context.identityId);
    return { authorizationUrl: this.oauth.authorizationUrl(redirectUri, state) };
  }

  async completeConnect(context: KanbanRequestContext, input: { code: string; state: string; redirectUri: string }, mutate: MutateContext) {
    this.oauth.assertRedirectUri(input.redirectUri);
    this.oauth.verifyState(input.state, context.clientId, context.identityId);
    const { refreshToken, email } = await this.oauth.exchangeCode(input.code, input.redirectUri);
    await this.repository.connect(context.databaseRef, context.clientId, context.identityId,
      { refreshTokenEnc: this.cipher.encrypt(context.clientId, refreshToken), email });
    await this.audit.record('kanban_drive_connected', mutate, null, {});
    return this.get(context);
  }

  /** Token de curta duracao para o seletor de pastas do Google abrir no navegador. */
  async pickerToken(context: KanbanRequestContext) {
    const row = await this.requireConnection(context);
    const { accessToken, expiresIn } = await this.accessTokenFor(context, row.refreshTokenEnc as Buffer);
    return { accessToken, expiresIn, apiKey: this.config.flowDrive.pickerApiKey, appId: this.config.flowDrive.pickerAppId };
  }

  async put(context: KanbanRequestContext, dto: DriveConfigurationWriteDto, mutate: MutateContext) {
    const row = await this.requireConnection(context);
    const folderId = dto.rootFolderId ?? row.rootFolderId;
    if (dto.enabled && !folderId) {
      throw new UnprocessableEntityException({ code: 'drive_folder_required', message: 'Choose a Drive folder first' });
    }
    let folder = { id: row.rootFolderId, name: row.rootFolderName };
    if (folderId && (dto.rootFolderId || dto.enabled)) {
      const { accessToken } = await this.accessTokenFor(context, row.refreshTokenEnc as Buffer);
      folder = await this.oauth.getFolder(accessToken, folderId);
    }
    await this.repository.saveFolder(context.databaseRef, context.clientId, context.identityId,
      { rootFolderId: folder.id, rootFolderName: folder.name, status: dto.enabled ? 'active' : 'inactive' });
    await this.audit.record('kanban_drive_configuration_updated', mutate, null, { enabled: dto.enabled });
    return this.get(context);
  }

  async disconnect(context: KanbanRequestContext, mutate: MutateContext) {
    const row = await this.repository.get(context.databaseRef, context.clientId);
    if (row?.refreshTokenEnc) {
      await this.oauth.revoke(this.cipher.decrypt(context.clientId, row.refreshTokenEnc));
      await this.repository.disconnect(context.databaseRef, context.clientId, context.identityId);
      await this.audit.record('kanban_drive_disconnected', mutate, null, {});
    }
    return this.get(context);
  }

  private async requireConnection(context: KanbanRequestContext) {
    const row = await this.repository.get(context.databaseRef, context.clientId);
    if (!row?.refreshTokenEnc) {
      throw new UnprocessableEntityException({ code: 'drive_not_connected', message: 'Connect a Google account first' });
    }
    return row;
  }

  private async accessTokenFor(context: KanbanRequestContext, refreshTokenEnc: Buffer) {
    try {
      return await this.oauth.accessToken(this.cipher.decrypt(context.clientId, refreshTokenEnc));
    } catch (error) {
      if ((error as { response?: { code?: string } }).response?.code === 'drive_oauth_invalid') {
        await this.repository.saveFolder(context.databaseRef, context.clientId, context.identityId, { rootFolderId: null, rootFolderName: null, status: 'invalid' });
      }
      throw error;
    }
  }

  private sanitize(row: Awaited<ReturnType<DriveConfigurationRepository['get']>>) {
    return {
      status: row?.status ?? 'inactive',
      connected: Boolean(row?.refreshTokenEnc),
      accountEmail: row?.googleAccountEmail ?? null,
      rootFolderId: row?.rootFolderId ?? null,
      rootFolderName: row?.rootFolderName ?? null,
      lastErrorCode: row?.lastErrorCode ?? null
    };
  }
}
