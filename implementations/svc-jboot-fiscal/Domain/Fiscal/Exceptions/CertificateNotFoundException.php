<?php

namespace Domain\Fiscal\Exceptions;

use RuntimeException;

class CertificateNotFoundException extends RuntimeException
{
    public function __construct(public readonly string $cnpjEmitente, public readonly string $ambiente)
    {
        parent::__construct("Certificado nao encontrado para CNPJ {$cnpjEmitente} em {$ambiente}");
    }
}
