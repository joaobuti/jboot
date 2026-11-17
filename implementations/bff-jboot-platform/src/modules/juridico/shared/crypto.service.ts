import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { AppConfigService } from '../../../config/app-config.service';

@Injectable()
export class CryptoService {
  constructor(private readonly config: AppConfigService) {}

  // Layout: iv(12) || authTag(16) || ciphertext
  encrypt(clientId: string, plaintext: string): Buffer {
    const key = this.deriveKey(clientId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  decrypt(clientId: string, data: Buffer): string {
    const key = this.deriveKey(clientId);
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  private deriveKey(clientId: string): Buffer {
    return createHmac('sha256', this.config.jwtSecret).update(clientId).digest();
  }
}
