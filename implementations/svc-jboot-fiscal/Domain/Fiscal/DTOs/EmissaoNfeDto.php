<?php

namespace Domain\Fiscal\DTOs;

readonly class EmissaoNfeDto
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
        public string $naturezaOperacao,
        public int $finalidade = 1,
        public bool $consumidorFinal = false,
        public int $presenca = 9,
        public ?DestinatarioDto $destinatario = null,
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
            naturezaOperacao: $doc['natureza_operacao'],
            finalidade: (int) ($doc['finalidade'] ?? 1),
            consumidorFinal: (bool) ($doc['consumidor_final'] ?? false),
            presenca: (int) ($doc['presenca'] ?? 9),
            destinatario: isset($doc['destinatario']) ? DestinatarioDto::fromArray($doc['destinatario']) : null,
        );
    }
}
