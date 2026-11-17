<?php

namespace Domain\Fiscal\Exceptions;

use RuntimeException;

class TenantMismatchException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('client_id do payload diverge do JWT');
    }
}
