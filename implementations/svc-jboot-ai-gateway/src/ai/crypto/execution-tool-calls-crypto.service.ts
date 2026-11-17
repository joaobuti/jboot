import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { ProviderToolCall } from '../providers/provider-execution';

type Binding = { executionId: string; clientId: string; applicationSlug: string };
type Envelope = { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number };

@Injectable()
export class ExecutionToolCallsCryptoService {
  constructor(private readonly config: AppConfigService) {}

  encrypt(calls: ProviderToolCall[], binding: Binding): Envelope {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.encryptionKey(), nonce);
    cipher.setAAD(this.aad(binding));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(calls), 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext,
      nonce,
      authTag: cipher.getAuthTag(),
      keyVersion: this.config.encryptionKeyVersion,
    };
  }

  decrypt(envelope: Envelope, binding: Binding): ProviderToolCall[] {
    if (envelope.keyVersion !== this.config.encryptionKeyVersion) {
      throw new Error('Unsupported encryption key version');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.config.encryptionKey(), envelope.nonce);
    decipher.setAAD(this.aad(binding));
    decipher.setAuthTag(envelope.authTag);
    const value = JSON.parse(
      Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString('utf8'),
    ) as unknown;
    if (!Array.isArray(value)) throw new Error('Invalid encrypted tool calls');
    return value as ProviderToolCall[];
  }

  private aad(binding: Binding): Buffer {
    return Buffer.from(
      `jboot-ai-execution-tools:v1:${binding.executionId}:${binding.clientId}:${binding.applicationSlug}:${this.config.encryptionKeyVersion}`,
    );
  }
}
