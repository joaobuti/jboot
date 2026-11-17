import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class AgentPromptCryptoService {
  constructor(private readonly config: AppConfigService) {}
  encrypt(
    prompt: string,
    binding: {
      agentId: string;
      version: number;
      clientId: string;
      ownerIdentityId: string;
      applicationSlug: string;
    },
  ) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.config.encryptionKey(),
      nonce,
    );
    cipher.setAAD(
      Buffer.from(
        `jboot-ai-agent-prompt:v1:${binding.agentId}:${binding.version}:${binding.clientId}:${binding.ownerIdentityId}:${binding.applicationSlug}:${this.config.encryptionKeyVersion}`,
      ),
    );
    const ciphertext = Buffer.concat([
      cipher.update(prompt, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext,
      nonce,
      authTag: cipher.getAuthTag(),
      keyVersion: this.config.encryptionKeyVersion,
    };
  }
  decrypt(
    envelope: {
      ciphertext: Buffer;
      nonce: Buffer;
      authTag: Buffer;
      keyVersion: number;
    },
    binding: {
      agentId: string;
      version: number;
      clientId: string;
      ownerIdentityId: string;
      applicationSlug: string;
    },
  ) {
    if (envelope.keyVersion !== this.config.encryptionKeyVersion)
      throw new Error("Unsupported encryption key version");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.config.encryptionKey(),
      envelope.nonce,
    );
    decipher.setAAD(
      Buffer.from(
        `jboot-ai-agent-prompt:v1:${binding.agentId}:${binding.version}:${binding.clientId}:${binding.ownerIdentityId}:${binding.applicationSlug}:${this.config.encryptionKeyVersion}`,
      ),
    );
    decipher.setAuthTag(envelope.authTag);
    return Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
