import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProviderRegistry } from '../providers/provider-registry';
import { createHash } from 'node:crypto';
import { AuthContext } from '../../auth/auth-context';
import { CredentialCryptoService } from '../crypto/credential-crypto.service';
import { ProviderCatalog } from '../providers/provider-catalog';
import { UpsertCredentialDto } from './credential.dto';
import { CredentialRecord, CredentialRepository } from './credential.repository';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class CredentialService {
  constructor(
    private readonly repository: CredentialRepository,
    private readonly crypto: CredentialCryptoService,
    private readonly catalog: ProviderCatalog,
    private readonly providers: ProviderRegistry,
    private readonly config: AppConfigService,
  ) {}
  private view(record: CredentialRecord) { return { id: record.id, provider: record.provider, status: record.status, last4: record.last4, createdAt: record.createdAt, updatedAt: record.updatedAt }; }
  private recordId(auth: AuthContext, provider: string) {
    const bytes = createHash('sha256').update(`jboot-ai-credential:v1:${auth.clientId}:${auth.identityId}:${provider}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  async list(auth: AuthContext) { return (await this.repository.list(auth.clientId, auth.identityId)).map((row) => this.view(row)); }
  async upsert(auth: AuthContext, input: UpsertCredentialDto) {
    this.catalog.requireActive(input.provider);
    const existing = (await this.repository.list(auth.clientId, auth.identityId)).find((row) => row.provider === input.provider);
    const recordId = existing?.id ?? this.recordId(auth, input.provider);
    const binding = { id: recordId, clientId: auth.clientId, ownerIdentityId: auth.identityId, provider: input.provider };
    const envelope = this.crypto.encrypt(input.apiKey, binding);
    return this.view(await this.repository.upsert(auth.clientId, auth.identityId, input.provider, envelope, input.apiKey.slice(-4), recordId));
  }
  async test(auth: AuthContext, id: string) {
    const record = await this.repository.find(id, auth.clientId, auth.identityId);
    if (!record || !record.ciphertext || !record.nonce || !record.authTag) throw new NotFoundException('Credential not found');
    this.catalog.requireActive(record.provider);
    const apiKey = this.crypto.decrypt({ ciphertext: record.ciphertext, nonce: record.nonce, authTag: record.authTag, keyVersion: record.keyVersion }, record);
    try {
      await this.providers.models(record.provider, apiKey);
    } catch (error) {
      if (error instanceof UnauthorizedException) await this.repository.setStatus(id, auth.clientId, auth.identityId, 'invalid', record.nonce);
      throw error;
    }
    const updated = await this.repository.setStatus(id, auth.clientId, auth.identityId, 'active', record.nonce);
    if (!updated) throw new ConflictException('ai_credential_changed_during_validation');
    return { id, provider: record.provider, status: updated.status, checkedAt: new Date() };
  }
  async models(auth: AuthContext, id: string) {
    const record = await this.repository.find(id, auth.clientId, auth.identityId);
    if (!record || record.status !== 'active' || !record.ciphertext || !record.nonce || !record.authTag) throw new NotFoundException('Active credential not found');
    this.catalog.requireActive(record.provider);
    const apiKey = this.crypto.decrypt({ ciphertext: record.ciphertext, nonce: record.nonce, authTag: record.authTag, keyVersion: record.keyVersion }, record);
    const models = await this.providers.models(record.provider, apiKey);
    return models
      .map((model) => ({
        ...model,
        capabilities: this.config.modelCapabilities(record.provider, model.id),
      }))
      .filter((model) => model.capabilities.length > 0);
  }
  async revoke(auth: AuthContext, id: string) {
    const record = await this.repository.revoke(id, auth.clientId, auth.identityId);
    if (!record) throw new NotFoundException('Credential not found');
    return this.view(record);
  }
}
