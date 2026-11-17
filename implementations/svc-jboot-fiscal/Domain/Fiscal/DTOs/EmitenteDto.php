<?php

namespace Domain\Fiscal\DTOs;

readonly class EmitenteDto
{
    public function __construct(
        public string $cnpj,
        public string $razaoSocial,
        public string $uf,
        public EnderecoDto $endereco,
        public int $crt,
        public ?string $nomeFantasia = null,
        public ?string $ie = null,
        public ?string $im = null,
        public ?string $cnae = null,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            cnpj: $data['cnpj'],
            razaoSocial: $data['razao_social'],
            uf: $data['uf'],
            endereco: EnderecoDto::fromArray($data['endereco']),
            crt: (int) $data['crt'],
            nomeFantasia: $data['nome_fantasia'] ?? null,
            ie: $data['ie'] ?? null,
            im: $data['im'] ?? null,
            cnae: $data['cnae'] ?? null,
        );
    }
}
