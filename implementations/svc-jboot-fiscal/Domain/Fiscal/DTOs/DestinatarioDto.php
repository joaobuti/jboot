<?php

namespace Domain\Fiscal\DTOs;

readonly class DestinatarioDto
{
    public function __construct(
        public string $razaoSocial,
        public EnderecoDto $endereco,
        public int $indIeDest = 9,
        public ?string $cnpj = null,
        public ?string $cpf = null,
        public ?string $ie = null,
        public ?string $email = null,
        public ?string $telefone = null,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            razaoSocial: $data['razao_social'],
            endereco: EnderecoDto::fromArray($data['endereco']),
            indIeDest: (int) ($data['ind_ie_dest'] ?? 9),
            cnpj: $data['cnpj'] ?? null,
            cpf: $data['cpf'] ?? null,
            ie: $data['ie'] ?? null,
            email: $data['email'] ?? null,
            telefone: $data['telefone'] ?? null,
        );
    }
}
