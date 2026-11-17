import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

export interface CredentialEnvelope { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number }
export interface CredentialBinding { id: string; clientId: string; ownerIdentityId: string; provider: string }

@Injectable()
export class CredentialCryptoService {
  constructor(private readonly config: AppConfigService) {}
  private aad(binding: CredentialBinding) { return Buffer.from(`jboot-ai-credential:v1:${binding.id}:${binding.clientId}:${binding.ownerIdentityId}:${binding.provider}:${this.config.encryptionKeyVersion}`); }
  encrypt(secret: string, binding: CredentialBinding): CredentialEnvelope {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.encryptionKey(), nonce);
    cipher.setAAD(this.aad(binding));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: this.config.encryptionKeyVersion };
  }
  decrypt(envelope: CredentialEnvelope, binding: CredentialBinding): string {
    if (envelope.keyVersion !== this.config.encryptionKeyVersion) throw new Error('Unsupported encryption key version');
    const decipher = createDecipheriv('aes-256-gcm', this.config.encryptionKey(), envelope.nonce);
    decipher.setAAD(this.aad(binding));
    decipher.setAuthTag(envelope.authTag);
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString('utf8');
  }
}
