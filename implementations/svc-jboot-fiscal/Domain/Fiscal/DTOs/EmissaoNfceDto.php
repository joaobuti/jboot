<?php

namespace Domain\Fiscal\DTOs;

readonly class EmissaoNfceDto
{
    /**
     * @param ItemNfeDto[]   $itens
     * @param PagamentoDto[] $pagamentos
     */
    public function __construct(
        public string $requestId,
        public string $clientId,
        public string $cnpjEmitente,
        public EmitenteDto $emitente,
        public \DateTimeImmutable $dataEmissao,
        public array $itens,
        public array $pagamentos,
        public TotaisDto $totais,
        public int $presenca = 1,
        public ?string $cpfConsumidor = null,
    ) {}

    public static function fromArray(array $data): self
    {
        $doc = $data['dados_documento'];

        return new self(
            requestId: $data['request_id'],
            clientId: $data['client_id'],
            cnpjEmitente: $data['cnpj_emitente'],
            emitente: EmitenteDto::fromArray($doc['emitente']),
            dataEmissao: new \DateTimeImmutable($doc['data_emissao']),
            itens: array_map(fn ($i) => ItemNfeDto::fromArray($i), $doc['itens']),
            pagamentos: array_map(fn ($p) => PagamentoDto::fromArray($p), $doc['pagamentos']),
            totais: TotaisDto::fromArray($doc['totais']),
            presenca: (int) ($doc['presenca'] ?? 1),
            cpfConsumidor: $doc['cpf_consumidor'] ?? null,
        );
    }
}
