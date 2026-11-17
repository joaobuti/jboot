<?php

namespace Domain\Fiscal\Exceptions;

use RuntimeException;

class CfopRequiredException extends RuntimeException
{
    public function __construct(public readonly int $itemSeq)
    {
        parent::__construct("CFOP obrigatório: item #{$itemSeq} sem CFOP e configuração fiscal sem CFOP padrão");
    }
}
