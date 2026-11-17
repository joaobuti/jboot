<?php

namespace Domain\Fiscal\DTOs;

readonly class PagamentoDto
{
    public function __construct(
        public int $formaPagamento,
        public float $valor,
        public ?float $troco = null,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            formaPagamento: (int) $data['forma_pagamento'],
            valor: (float) $data['valor'],
            troco: isset($data['troco']) ? (float) $data['troco'] : null,
        );
    }
}
