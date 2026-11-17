<?php

namespace Infrastructure\Crypto;

use RuntimeException;

class CertificateCrypto
{
    private string $key;

    public function __construct(string $encryptionKeyHex)
    {
        if (! $encryptionKeyHex || strlen($encryptionKeyHex) !== 64) {
            throw new RuntimeException('FISCAL_CERT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
        }
        $this->key = hex2bin($encryptionKeyHex);
    }

    public function encrypt(string $pfxBinary): array
    {
        $iv = random_bytes(12);
        $tag = '';
        $encrypted = openssl_encrypt($pfxBinary, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);

        if ($encrypted === false) {
            throw new RuntimeException('Certificate encryption failed');
        }

        return [
            'pfx_encrypted' => $encrypted,
            'encryption_iv' => $iv,
            'encryption_tag' => $tag,
        ];
    }

    public function decrypt(string $pfxEncrypted, string $iv, string $tag): string
    {
        $decrypted = openssl_decrypt($pfxEncrypted, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);

        if ($decrypted === false) {
            throw new RuntimeException('Certificate decryption failed');
        }

        return $decrypted;
    }
}
