import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../../config/app-config.service';

/** Cifra do refresh token do Drive com chave exclusiva derivada por cliente. */
@Injectable()
export class DriveTokenCipher {
  constructor(private readonly config: AppConfigService) {}

  encrypt(clientId: string, plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(clientId, 'token'), iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  decrypt(clientId: string, ciphertext: Buffer): string {
    if (ciphertext.length < 29) throw this.unavailable();
    const decipher = createDecipheriv('aes-256-gcm', this.key(clientId, 'token'), ciphertext.subarray(0, 12));
    decipher.setAuthTag(ciphertext.subarray(12, 28));
    return decipher.update(ciphertext.subarray(28)) + decipher.final('utf8');
  }

  /** Assinatura HMAC (base64url) usada no `state` do consentimento OAuth. */
  sign(value: string): string {
    return createHmac('sha256', this.key('', 'state')).update(value).digest('base64url');
  }

  private key(clientId: string, purpose: 'token' | 'state'): Buffer {
    const secret = this.config.flowDrive.encryptionKey;
    if (!secret) throw this.unavailable();
    return createHmac('sha256', secret).update(`${purpose}:${clientId}`).digest();
  }

  private unavailable() {
    return new ServiceUnavailableException({ code: 'drive_encryption_unavailable', message: 'Drive encryption is not configured' });
  }
}
