<?php

namespace Domain\Fiscal\DTOs;

readonly class ItemNfeDto
{
    public function __construct(
        public string $codigo,
        public string $descricao,
        public string $ncm,
        public ?string $cfop,
        public string $unidade,
        public float $quantidade,
        public float $valorUnitario,
        public float $valorTotal,
        public string $gtin = 'SEM GTIN',
        public string $gtinTributavel = 'SEM GTIN',
        public ?ImpostosItemDto $impostos = null,
        public ?string $cest = null,
        public int $indTot = 1,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            codigo: $data['codigo'],
            descricao: $data['descricao'],
            ncm: $data['ncm'],
            cfop: $data['cfop'] ?? null,
            unidade: $data['unidade'],
            quantidade: (float) $data['quantidade'],
            valorUnitario: (float) $data['valor_unitario'],
            valorTotal: (float) $data['valor_total'],
            gtin: $data['gtin'] ?? 'SEM GTIN',
            gtinTributavel: $data['gtin_tributavel'] ?? $data['gtin'] ?? 'SEM GTIN',
            impostos: isset($data['impostos']) ? ImpostosItemDto::fromArray($data['impostos']) : null,
            cest: $data['cest'] ?? null,
            indTot: (int) ($data['ind_tot'] ?? 1),
        );
    }

    public function withCfop(string $cfop): self
    {
        return new self(
            codigo: $this->codigo,
            descricao: $this->descricao,
            ncm: $this->ncm,
            cfop: $cfop,
            unidade: $this->unidade,
            quantidade: $this->quantidade,
            valorUnitario: $this->valorUnitario,
            valorTotal: $this->valorTotal,
            gtin: $this->gtin,
            gtinTributavel: $this->gtinTributavel,
            impostos: $this->impostos,
            cest: $this->cest,
            indTot: $this->indTot,
        );
    }

    public function withImpostos(ImpostosItemDto $impostos): self
    {
        return new self(
            codigo: $this->codigo,
            descricao: $this->descricao,
            ncm: $this->ncm,
            cfop: $this->cfop,
            unidade: $this->unidade,
            quantidade: $this->quantidade,
            valorUnitario: $this->valorUnitario,
            valorTotal: $this->valorTotal,
            gtin: $this->gtin,
            gtinTributavel: $this->gtinTributavel,
            impostos: $impostos,
            cest: $this->cest,
            indTot: $this->indTot,
        );
    }
}
