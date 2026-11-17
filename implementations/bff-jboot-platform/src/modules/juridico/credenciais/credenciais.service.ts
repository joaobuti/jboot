import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JuridicoRequestContext } from '../shared/juridico.types';
import { CryptoService } from '../shared/crypto.service';
import { CredenciaisRepository } from './credenciais.repository';
import { CredencialStatusDto, SetCredencialBodyDto } from './dto/credencial.dto';

@Injectable()
export class CredenciaisService {
  constructor(
    private readonly repo: CredenciaisRepository,
    private readonly crypto: CryptoService,
  ) {}

  async getStatus(clientId: string, databaseRef: string, portalSlug: string): Promise<CredencialStatusDto> {
    const row = await this.repo.getStatus(clientId, databaseRef, portalSlug);
    if (!row) {
      throw new NotFoundException(`Portal '${portalSlug}' not found`);
    }
    return {
      portalSlug: row.slug,
      authType: row.authType as 'user_pass' | 'token',
      configured: Boolean(row.configured),
      updatedAt: row.updatedAt ?? null,
    };
  }

  async set(
    ctx: JuridicoRequestContext,
    portalSlug: string,
    body: SetCredencialBodyDto,
    ip: string | null,
  ): Promise<CredencialStatusDto> {
    const status = await this.getStatus(ctx.clientId, ctx.databaseRef, portalSlug);

    let encryptedUsername: Buffer | null = null;
    let encryptedPassword: Buffer | null = null;
    let encryptedToken: Buffer | null = null;

    if (status.authType === 'user_pass') {
      if (!body.username || !body.password) {
        throw new BadRequestException('username and password are required');
      }
      encryptedUsername = this.crypto.encrypt(ctx.clientId, body.username);
      encryptedPassword = this.crypto.encrypt(ctx.clientId, body.password);
    } else if (status.authType === 'token') {
      if (!body.token) {
        throw new BadRequestException('token is required');
      }
      encryptedToken = this.crypto.encrypt(ctx.clientId, body.token);
    }

    await this.repo.upsert(ctx.clientId, ctx.databaseRef, portalSlug, {
      encryptedUsername,
      encryptedPassword,
      encryptedToken,
      keyRef: 'hmac-v1',
    });

    await this.repo.auditLog(ctx.clientId, ctx.databaseRef, {
      identityId: ctx.identityId,
      eventType: status.configured ? 'credential_updated' : 'credential_created',
      portalSlug,
      payload: { authType: status.authType },
      ip,
    });

    return this.getStatus(ctx.clientId, ctx.databaseRef, portalSlug);
  }

  async getDecrypted(
    clientId: string,
    databaseRef: string,
    portalSlug: string,
  ): Promise<{ username: string; password: string } | null> {
    const enc = await this.repo.getEncrypted(clientId, databaseRef, portalSlug);
    if (!enc?.encUsername || !enc?.encPassword) return null;
    return {
      username: this.crypto.decrypt(clientId, enc.encUsername),
      password: this.crypto.decrypt(clientId, enc.encPassword),
    };
  }

  async remove(ctx: JuridicoRequestContext, portalSlug: string, ip: string | null): Promise<void> {
    const status = await this.getStatus(ctx.clientId, ctx.databaseRef, portalSlug);
    const removed = await this.repo.remove(ctx.clientId, ctx.databaseRef, portalSlug);
    if (!removed) {
      throw new NotFoundException('Credential not found');
    }
    await this.repo.auditLog(ctx.clientId, ctx.databaseRef, {
      identityId: ctx.identityId,
      eventType: 'credential_deleted',
      portalSlug,
      payload: { authType: status.authType },
      ip,
    });
  }
}
