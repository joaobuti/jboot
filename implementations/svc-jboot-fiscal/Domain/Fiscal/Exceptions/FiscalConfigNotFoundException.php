<?php

namespace Domain\Fiscal\Exceptions;

use RuntimeException;

class FiscalConfigNotFoundException extends RuntimeException
{
    public function __construct(public readonly string $cnpjEmitente)
    {
        parent::__construct("Configuração fiscal não encontrada para CNPJ {$cnpjEmitente}");
    }
}
