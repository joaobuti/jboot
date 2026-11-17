<?php

namespace Domain\Fiscal\Services;

use Domain\Fiscal\Repositories\FiscalCertificateRepository;
use Infrastructure\Crypto\CertificateCrypto;
use Illuminate\Support\Str;
use RuntimeException;

class CertificadoService
{
    public function __construct(
        private FiscalCertificateRepository $repo,
        private CertificateCrypto $crypto,
    ) {}

    public function armazenar(
        string $clientId,
        string $cnpjEmitente,
        string $ambiente,
        string $pfxBinary,
        string $pfxPassword,
    ): array {
        [$metadata, $normalizedPfx] = $this->parseAndNormalizePfx($pfxBinary, $pfxPassword);
        $this->assertNaoExpirado($metadata['valid_until'], $cnpjEmitente);

        // A senha fornecida nunca e persistida. O PKCS#12 e reexportado sem
        // senha e imediatamente protegido pelo envelope AES-256-GCM do tenant.
        $encrypted = $this->crypto->encrypt($normalizedPfx);

        $id = $this->repo->upsert([
            'client_id'       => $clientId,
            'cnpj_emitente'   => $cnpjEmitente,
            'ambiente'        => $ambiente,
            'pfx_encrypted'   => $encrypted['pfx_encrypted'],
            'encryption_iv'   => $encrypted['encryption_iv'],
            'encryption_tag'  => $encrypted['encryption_tag'],
            'razao_social'    => $metadata['subject_cn'],
            'valid_from'      => $metadata['valid_from'],
            'valid_until'     => $metadata['valid_until'],
            'serial_number'   => $metadata['serial_number'],
            'subject_cn'      => $metadata['subject_cn'],
            'status'          => 'active',
        ]);

        return [
            'id'           => $id,
            'cnpj_emitente' => $cnpjEmitente,
            'ambiente'     => $ambiente,
            'subject_cn'   => $metadata['subject_cn'],
            'valid_from'   => $metadata['valid_from'],
            'valid_until'  => $metadata['valid_until'],
            'status'       => 'active',
        ];
    }

    private function parseAndNormalizePfx(string $pfxBinary, string $pfxPassword): array
    {
        $certs = [];
        $parsed = openssl_pkcs12_read($pfxBinary, $certs, $pfxPassword);

        if (! $parsed || empty($certs['cert'])) {
            throw new RuntimeException('PFX invalido ou senha incorreta');
        }

        $info = openssl_x509_parse($certs['cert']);

        if (! $info) {
            throw new RuntimeException('Nao foi possivel extrair informacoes do certificado');
        }

        $normalizedPfx = '';
        $exported = openssl_pkcs12_export(
            $certs['cert'],
            $normalizedPfx,
            $certs['pkey'],
            '',
            isset($certs['extracerts']) ? ['extracerts' => $certs['extracerts']] : []
        );
        if (! $exported || $normalizedPfx === '') {
            throw new RuntimeException('Nao foi possivel normalizar o certificado');
        }

        return [[
            'subject_cn'    => $info['subject']['CN'] ?? ($info['subject']['O'] ?? 'Desconhecido'),
            'serial_number' => $info['serialNumberHex'] ?? (string) $info['serialNumber'],
            'valid_from'    => date('Y-m-d H:i:s', $info['validFrom_time_t']),
            'valid_until'   => date('Y-m-d H:i:s', $info['validTo_time_t']),
        ], $normalizedPfx];
    }

    private function assertNaoExpirado(string $validUntil, string $cnpjEmitente): void
    {
        if (now()->isAfter($validUntil)) {
            throw new \Domain\Fiscal\Exceptions\CertificateExpiredException($cnpjEmitente, $validUntil);
        }
    }
}
