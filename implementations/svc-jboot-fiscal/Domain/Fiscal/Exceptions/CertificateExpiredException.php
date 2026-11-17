<?php

namespace Domain\Fiscal\Exceptions;

use RuntimeException;

class CertificateExpiredException extends RuntimeException
{
    public function __construct(public readonly string $cnpjEmitente, public readonly string $validUntil)
    {
        parent::__construct("Certificado expirado para CNPJ {$cnpjEmitente}");
    }
}
