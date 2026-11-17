<?php

namespace Domain\Fiscal\Exceptions;

use RuntimeException;

class SefazRejeicaoException extends RuntimeException
{
    public function __construct(
        public readonly string $sefazCodigo,
        public readonly string $sefazMotivo,
        public readonly string $xmlRetorno,
    ) {
        parent::__construct("SEFAZ {$sefazCodigo}: {$sefazMotivo}");
    }
}
