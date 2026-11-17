<?php

namespace Domain\Fiscal\Services;

use Domain\Fiscal\Exceptions\CertificateExpiredException;
use Domain\Fiscal\Repositories\FiscalCertificateRepository;
use Infrastructure\Crypto\CertificateCrypto;

class CertificateLoader
{
    public function __construct(
        private FiscalCertificateRepository $repo,
        private CertificateCrypto $crypto,
    ) {}

    public function loadDecrypted(string $clientId, string $cnpjEmitente, string $ambiente): string
    {
        $cert = $this->repo->findByTenant($clientId, $cnpjEmitente, $ambiente);

        if (now()->isAfter($cert->valid_until)) {
            $this->repo->markAsExpired($cert->id);
            throw new CertificateExpiredException($cnpjEmitente, $cert->valid_until);
        }

        if ($cert->status !== 'active') {
            throw new CertificateExpiredException($cnpjEmitente, $cert->valid_until);
        }

        return $this->crypto->decrypt(
            $this->toBytes($cert->pfx_encrypted),
            $this->toBytes($cert->encryption_iv),
            $this->toBytes($cert->encryption_tag),
        );
    }

    private function toBytes(mixed $value): string
    {
        return is_resource($value) ? stream_get_contents($value) : (string) $value;
    }
}
