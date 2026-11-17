<?php

namespace Domain\Fiscal\DTOs;

readonly class ImpostosItemDto
{
    public function __construct(
        public float $vBC = 0.0,
        public float $pICMS = 0.0,
        public float $vICMS = 0.0,
        public int $origemIcms = 0,
        public int $cstIcms = 0,
        public int $csosnIcms = 0,
        public float $pPIS = 0.0,
        public float $vPIS = 0.0,
        public int $cstPis = 7,
        public float $pCOFINS = 0.0,
        public float $vCOFINS = 0.0,
        public int $cstCofins = 7,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            vBC: (float) ($data['v_bc'] ?? 0),
            pICMS: (float) ($data['p_icms'] ?? 0),
            vICMS: (float) ($data['v_icms'] ?? 0),
            origemIcms: (int) ($data['origem_icms'] ?? 0),
            cstIcms: (int) ($data['cst_icms'] ?? 0),
            csosnIcms: (int) ($data['csosn_icms'] ?? 0),
            pPIS: (float) ($data['p_pis'] ?? 0),
            vPIS: (float) ($data['v_pis'] ?? 0),
            cstPis: (int) ($data['cst_pis'] ?? 7),
            pCOFINS: (float) ($data['p_cofins'] ?? 0),
            vCOFINS: (float) ($data['v_cofins'] ?? 0),
            cstCofins: (int) ($data['cst_cofins'] ?? 7),
        );
    }
}
