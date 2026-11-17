<?php

namespace Domain\Fiscal\DTOs;

readonly class EnderecoDto
{
    public function __construct(
        public string $logradouro,
        public string $numero,
        public string $bairro,
        public string $municipio,
        public string $uf,
        public string $cep,
        public string $codigoMunicipio,
        public string $pais = 'Brasil',
        public string $codigoPais = '1058',
        public ?string $complemento = null,
        public ?string $telefone = null,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            logradouro: $data['logradouro'],
            numero: $data['numero'],
            bairro: $data['bairro'],
            municipio: $data['municipio'],
            uf: $data['uf'],
            cep: $data['cep'],
            codigoMunicipio: $data['codigo_municipio'],
            pais: $data['pais'] ?? 'Brasil',
            codigoPais: $data['codigo_pais'] ?? '1058',
            complemento: $data['complemento'] ?? null,
            telefone: $data['telefone'] ?? null,
        );
    }
}
