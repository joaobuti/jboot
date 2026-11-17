<?php

namespace Domain\Fiscal\DTOs;

readonly class TotaisDto
{
    public function __construct(
        public float $vBC,
        public float $vICMS,
        public float $vProd,
        public float $vNF,
        public float $vPIS = 0.0,
        public float $vCOFINS = 0.0,
        public float $vDesc = 0.0,
        public float $vFrete = 0.0,
        public float $vSeg = 0.0,
        public float $vOutro = 0.0,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            vBC: (float) $data['v_bc'],
            vICMS: (float) $data['v_icms'],
            vProd: (float) $data['v_prod'],
            vNF: (float) $data['v_nf'],
            vPIS: (float) ($data['v_pis'] ?? 0),
            vCOFINS: (float) ($data['v_cofins'] ?? 0),
            vDesc: (float) ($data['v_desc'] ?? 0),
            vFrete: (float) ($data['v_frete'] ?? 0),
            vSeg: (float) ($data['v_seg'] ?? 0),
            vOutro: (float) ($data['v_outro'] ?? 0),
        );
    }
}
