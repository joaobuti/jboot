<?php

namespace Domain\Fiscal\Events;

class CceRegistrada
{
    public function __construct(
        public readonly string $documentoId,
        public readonly string $clientId,
        public readonly string $eventType,
        public readonly string $statusNovo,
        public readonly ?string $statusAnterior = null,
        public readonly ?string $sefazCodigo = null,
        public readonly ?string $sefazMotivo = null,
    ) {}
}
