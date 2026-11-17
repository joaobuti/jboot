import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { normalizeDocument } from '../shared/document';
import { inviteEmail, maskDocument, passwordResetEmail } from './account-access.emails';
import { AccountAccessRepository, AccessTokenPurpose } from './account-access.repository';

export interface InviteResult {
  sent: boolean;
  /** Sem e-mail cadastrado ou falha no SMTP: o operador ve o aviso e reenvia. */
  reason?: 'no_email' | 'send_failed';
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Limites do "esqueci minha senha": por login e por IP, por hora. */
export const RESET_LIMIT_PER_IDENTITY = 3;
export const RESET_LIMIT_PER_IP = 10;
const HOUR_MS = 3_600_000;

const LINK_INVALID = { code: 'access_link_invalid', message: 'Link invalido, vencido ou ja usado.' };

/**
 * Convite e senha da conta (docs/product/account-access-email-sprints.md). O token em claro so
 * existe no e-mail; o banco guarda o hash.
 */
@Injectable()
export class AccountAccessService {
  private readonly logger = new Logger(AccountAccessService.name);
  private readonly resetRequestsByIp = new Map<string, number[]>();

  constructor(
    private readonly repository: AccountAccessRepository,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService
  ) {}

  /** Convite do admin do cliente: so para conta ainda sem senha (`pending`). */
  async sendInvite(identityId: string, actorIdentityId?: string | null, ip?: string): Promise<InviteResult> {
    const identity = await this.repository.findIdentity(identityId);
    if (!identity) throw new NotFoundException('Identity not found');
    if (identity.status !== 'pending') {
      throw new ConflictException({ code: 'identity_not_pending', message: 'A conta ja tem senha; use "Esqueci minha senha".' });
    }
    if (!identity.email) {
      await this.audit.record({ eventType: 'account_invite_failed', identityId, ip, metadata: { reason: 'no_email' } });
      return { sent: false, reason: 'no_email' };
    }
    const link = await this.issueLink(identityId, 'invite', this.config.inviteTtlHours * 3600, ip, actorIdentityId);
    if (!link) return { sent: false, reason: 'send_failed' };
    try {
      await this.mail.send(
        inviteEmail({
          to: identity.email,
          displayName: identity.displayName,
          login: maskDocument(identity.documentType, identity.documentNumber),
          link,
          validity: `${this.config.inviteTtlHours} horas`
        }),
        'account-invite'
      );
    } catch {
      await this.audit.record({ eventType: 'account_invite_failed', identityId, ip, metadata: { reason: 'send_failed' } });
      return { sent: false, reason: 'send_failed' };
    }
    await this.audit.record({ eventType: 'account_invite_sent', identityId, ip, metadata: { actorIdentityId: actorIdentityId ?? null } });
    return { sent: true };
  }

  /** Confere o link antes de mostrar o formulario. */
  async check(token: string): Promise<{ purpose: AccessTokenPurpose; displayName: string; login: string }> {
    const valid = await this.repository.findValid(hashToken(token));
    if (!valid) throw new NotFoundException(LINK_INVALID);
    return { purpose: valid.purpose, displayName: valid.displayName, login: maskDocument(valid.documentType, valid.documentNumber) };
  }

  async setPassword(token: string, password: string, ip?: string): Promise<{ ok: true; purpose: AccessTokenPurpose }> {
    const valid = await this.repository.findValid(hashToken(token));
    if (!valid) throw new NotFoundException(LINK_INVALID);
    const consumed = await this.repository.consume(valid.tokenId, valid.identityId, await bcrypt.hash(password, 12));
    if (!consumed) throw new NotFoundException(LINK_INVALID);
    await this.audit.record({ eventType: 'password_set', identityId: valid.identityId, ip, metadata: { purpose: valid.purpose } });
    return { ok: true, purpose: valid.purpose };
  }

  /**
   * "Esqueci minha senha": responde sempre igual e na hora; o resto roda depois da resposta, para o
   * tempo de resposta nao revelar se o documento existe. Sem e-mail, bloqueado ou acima do limite,
   * nada e enviado.
   */
  requestPasswordReset(document: string, ip?: string, now = Date.now()): { accepted: true } {
    if (this.allowIp(ip ?? 'unknown', now)) {
      void this.processPasswordReset(document, ip).catch((error: unknown) => {
        this.logger.error(`Password reset failed: ${(error as Error).message}`);
      });
    }
    return { accepted: true };
  }

  async processPasswordReset(document: string, ip?: string): Promise<'sent' | 'skipped'> {
    let normalized: ReturnType<typeof normalizeDocument>;
    try {
      normalized = normalizeDocument(document);
    } catch {
      return 'skipped';
    }
    const identity = await this.repository.findIdentityByDocument(normalized.documentType, normalized.documentNumber);
    if (!identity || !identity.email || !['active', 'pending'].includes(identity.status)) {
      await this.audit.record({ eventType: 'password_reset_skipped', identityId: identity?.id, ip, metadata: { reason: identity ? 'no_email_or_inactive' : 'not_found' } });
      return 'skipped';
    }
    const minutes = this.config.passwordResetTtlMinutes;
    const link = await this.issueLink(identity.id, 'password_reset', minutes * 60, ip, null, {
      max: RESET_LIMIT_PER_IDENTITY,
      since: new Date(Date.now() - HOUR_MS)
    });
    if (!link) {
      await this.audit.record({ eventType: 'password_reset_skipped', identityId: identity.id, ip, metadata: { reason: 'rate_limited' } });
      return 'skipped';
    }
    await this.mail.send(
      passwordResetEmail({
        to: identity.email,
        displayName: identity.displayName,
        login: maskDocument(identity.documentType, identity.documentNumber),
        link,
        validity: minutes % 60 === 0 ? `${minutes / 60} hora${minutes === 60 ? '' : 's'}` : `${minutes} minutos`
      }),
      'password-reset'
    );
    await this.audit.record({ eventType: 'password_reset_sent', identityId: identity.id, ip });
    return 'sent';
  }

  /** Janela de 1 h em memoria (instancia unica do Identity); passa do limite, ignora em silencio. */
  private allowIp(ip: string, now: number): boolean {
    const recent = (this.resetRequestsByIp.get(ip) ?? []).filter((at) => now - at < HOUR_MS);
    if (recent.length >= RESET_LIMIT_PER_IP) {
      this.resetRequestsByIp.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.resetRequestsByIp.set(ip, recent);
    return true;
  }

  protected async issueLink(
    identityId: string,
    purpose: AccessTokenPurpose,
    ttlSeconds: number,
    ip?: string,
    actorIdentityId?: string | null,
    limit?: { max: number; since: Date }
  ): Promise<string | null> {
    const token = randomBytes(32).toString('base64url');
    const issued = await this.repository.issue({
      identityId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      requestedIp: ip ?? null,
      createdByIdentityId: actorIdentityId ?? null,
      limit
    });
    return issued ? `${this.config.identityWebUrl}/criar-senha?token=${encodeURIComponent(token)}` : null;
  }
}
