import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../../config/app-config.service';

/** Cifra de número CNJ com chave exclusiva e escopo por cliente. */
@Injectable()
export class DataJudMonitorCryptoService {
  constructor(private readonly config: AppConfigService) {}

  encrypt(clientId: string, plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(clientId), iv);
    // O auth tag so existe depois de `final()`; ler antes lanca "Invalid state
    // for operation getAuthTag". O layout gravado continua iv|tag|ciphertext,
    // que e o que `decrypt` espera.
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  decrypt(clientId: string, ciphertext: Buffer): string {
    if (ciphertext.length < 29) throw new ServiceUnavailableException('Cifra de monitoramento invalida');
    const decipher = createDecipheriv('aes-256-gcm', this.key(clientId), ciphertext.subarray(0, 12));
    decipher.setAuthTag(ciphertext.subarray(12, 28));
    return decipher.update(ciphertext.subarray(28)) + decipher.final('utf8');
  }

  private key(clientId: string): Buffer {
    if (!this.config.juridicoMonitorEncryptionKey) throw new ServiceUnavailableException('Chave de criptografia do monitoramento nao configurada');
    return createHmac('sha256', this.config.juridicoMonitorEncryptionKey).update(clientId).digest();
  }
}
