<?php

use Domain\Fiscal\Repositories\FiscalCertificateRepository;
use Domain\Fiscal\Services\CertificadoService;
use Infrastructure\Crypto\CertificateCrypto;

it('normalizes a password protected PFX before encrypted storage', function () {
    $key = openssl_pkey_new(['private_key_bits' => 2048]);
    $csr = openssl_csr_new(['commonName' => 'EMITENTE HOMOLOGACAO'], $key);
    $certificate = openssl_csr_sign($csr, null, $key, 30);
    $originalPfx = '';
    expect(openssl_pkcs12_export($certificate, $originalPfx, $key, 'temporary-password'))->toBeTrue();

    $crypto = new class extends CertificateCrypto {
        public string $plain = '';
        public function __construct() {}
        public function encrypt(string $pfxBinary): array
        {
            $this->plain = $pfxBinary;
            return ['pfx_encrypted' => 'encrypted', 'encryption_iv' => 'iv', 'encryption_tag' => 'tag'];
        }
    };
    $repo = new class extends FiscalCertificateRepository {
        public array $saved = [];
        public function upsert(array $data): string
        {
            $this->saved = $data;
            return 'certificate-id';
        }
    };

    $service = new CertificadoService($repo, $crypto);
    $service->armazenar('11111111-1111-4111-8111-111111111111', '00000000000000', 'homologacao', $originalPfx, 'temporary-password');

    $normalized = [];
    expect(openssl_pkcs12_read($crypto->plain, $normalized, ''))->toBeTrue()
        ->and($repo->saved)->not->toHaveKey('pfx_password');
});

