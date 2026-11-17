import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { DriveTokenCipher } from './drive-token-cipher.service';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
// drive.file: o app so enxerga o que ele cria e as pastas escolhidas no Picker.
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email';
const STATE_TTL_MS = 10 * 60 * 1000;
export const DRIVE_SETTINGS_PATH = '/flow/configuracoes/google-drive';

@Injectable()
export class GoogleDriveOAuthService {
  constructor(private readonly config: AppConfigService, private readonly cipher: DriveTokenCipher) {}

  assertConfigured() {
    if (!this.config.flowDrive.oauthClientId || !this.config.flowDrive.oauthClientSecret) {
      throw new ServiceUnavailableException({ code: 'drive_oauth_not_configured', message: 'Google Drive OAuth is not configured' });
    }
  }

  /** O redirect volta para a propria tela do Flow; o Google ainda exige URI pre-registrada. */
  assertRedirectUri(redirectUri: string) {
    let url: URL;
    try { url = new URL(redirectUri); } catch { throw this.invalid('drive_redirect_invalid'); }
    if (!this.config.corsOrigins.includes(url.origin) || url.pathname !== DRIVE_SETTINGS_PATH || url.search || url.hash) {
      throw this.invalid('drive_redirect_invalid');
    }
  }

  createState(clientId: string, identityId: string, now = Date.now()): string {
    const payload = Buffer.from(JSON.stringify({ c: clientId, i: identityId, e: now + STATE_TTL_MS, n: randomBytes(8).toString('hex') })).toString('base64url');
    return `${payload}.${this.cipher.sign(payload)}`;
  }

  /** O callback chega autenticado pela sessao: o state precisa ser do mesmo cliente e usuario. */
  verifyState(state: string, clientId: string, identityId: string, now = Date.now()) {
    const [payload, signature] = state.split('.');
    const expected = payload ? this.cipher.sign(payload) : '';
    if (!payload || !signature || signature.length !== expected.length
      || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw this.invalid('drive_state_invalid');
    let data: { c?: string; i?: string; e?: number };
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw this.invalid('drive_state_invalid'); }
    if (data.c !== clientId || data.i !== identityId || typeof data.e !== 'number' || data.e < now) throw this.invalid('drive_state_invalid');
  }

  authorizationUrl(redirectUri: string, state: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.config.flowDrive.oauthClientId, redirect_uri: redirectUri, response_type: 'code',
      scope: SCOPES, access_type: 'offline', prompt: 'consent', state
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; email: string }> {
    this.assertConfigured();
    const response = await this.post(TOKEN_URL, {
      code, redirect_uri: redirectUri, grant_type: 'authorization_code',
      client_id: this.config.flowDrive.oauthClientId, client_secret: this.config.flowDrive.oauthClientSecret
    });
    if (!response.ok) throw this.invalid('drive_code_invalid');
    const body = await response.json() as { refresh_token?: string; id_token?: string; scope?: string };
    // Sem o escopo de Drive o cliente desmarcou a permissao na tela do Google.
    if (!body.refresh_token || !body.scope?.includes('drive.file')) throw this.invalid('drive_permission_denied');
    return { refreshToken: body.refresh_token, email: this.emailFromIdToken(body.id_token) };
  }

  async accessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    this.assertConfigured();
    const response = await this.post(TOKEN_URL, {
      refresh_token: refreshToken, grant_type: 'refresh_token',
      client_id: this.config.flowDrive.oauthClientId, client_secret: this.config.flowDrive.oauthClientSecret
    });
    // 400/401 = token revogado ou expirado (precisa reconectar); o resto e indisponibilidade transitoria.
    if (response.status === 400 || response.status === 401) throw this.invalid('drive_oauth_invalid');
    if (!response.ok) throw new ServiceUnavailableException({ code: 'drive_oauth_unavailable', message: 'Google OAuth unavailable' });
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw this.invalid('drive_oauth_invalid');
    return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3000 };
  }

  async getFolder(accessToken: string, folderId: string): Promise<{ id: string; name: string }> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw this.invalid('drive_folder_unavailable');
    const body = await response.json() as { id?: string; name?: string; mimeType?: string; trashed?: boolean };
    if (!body.id || body.trashed || body.mimeType !== 'application/vnd.google-apps.folder') throw this.invalid('drive_folder_invalid');
    return { id: body.id, name: body.name ?? '' };
  }

  /** Melhor esforco: o cliente pode ja ter revogado o acesso no Google. */
  async revoke(refreshToken: string) {
    try { await this.post(REVOKE_URL, { token: refreshToken }); } catch { /* ignorado */ }
  }

  private post(url: string, form: Record<string, string>) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form), signal: AbortSignal.timeout(10_000)
    });
  }

  private emailFromIdToken(idToken?: string): string {
    try {
      const claims = JSON.parse(Buffer.from((idToken ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string };
      return claims.email ?? '';
    } catch { return ''; }
  }

  private invalid(code: string) {
    return new UnprocessableEntityException({ code, message: 'Google Drive configuration is invalid' });
  }
}
