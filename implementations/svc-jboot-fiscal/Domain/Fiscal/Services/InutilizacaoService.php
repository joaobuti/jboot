<?php

namespace Domain\Fiscal\Services;

use Domain\Fiscal\Events\NumeracaoInutilizada;
use Domain\Fiscal\Listeners\RegistrarEventoAuditoria;
use Domain\Fiscal\Repositories\FiscalInutilizationRepository;
use Infrastructure\Sefaz\SefazGateway;
use Illuminate\Support\Facades\DB;

class InutilizacaoService
{
    public function __construct(
        private FiscalInutilizationRepository $inutilizacoes,
        private CertificateLoader $certLoader,
        private SefazGateway $sefaz,
        private RegistrarEventoAuditoria $auditoria,
    ) {}

    public function inutilizar(
        string $clientId,
        string $cnpjEmitente,
        string $tipoDocumento,
        int $serie,
        int $numeroIni,
        int $numeroFim,
        string $justificativa,
        string $ambiente,
    ): array {
        $this->assertIntervaloValido($numeroIni, $numeroFim);

        $pfxBinary = $this->certLoader->loadDecrypted($clientId, $cnpjEmitente, $ambiente);

        return DB::transaction(function () use ($clientId, $cnpjEmitente, $tipoDocumento, $serie, $numeroIni, $numeroFim, $justificativa, $ambiente, $pfxBinary) {
            $sefazConfig = [
                'cnpj_emitente' => $cnpjEmitente,
                'razao_social'  => '',
                'uf'            => '',
                'ambiente'      => $ambiente,
                'csc'           => '',
                'csc_id'        => '',
                'serie'         => $serie,
            ];

            $resultado = $this->sefaz->inutilizar($sefazConfig, $pfxBinary, '', $serie, $numeroIni, $numeroFim, $justificativa);

            $inutilizacaoId = $this->inutilizacoes->create([
                'client_id'       => $clientId,
                'cnpj_emitente'   => $cnpjEmitente,
                'tipo_documento'  => $tipoDocumento,
                'serie'           => $serie,
                'numero_inicial'  => $numeroIni,
                'numero_final'    => $numeroFim,
                'justificativa'   => $justificativa,
                'ambiente'        => $ambiente,
                'protocolo'       => $resultado['protocolo'],
                'data_inutilizacao' => $resultado['data_inutilizacao'],
                'xml_retorno'     => $resultado['xml_retorno'],
            ]);

            $this->auditoria->handle(new NumeracaoInutilizada(
                documentoId: $inutilizacaoId,
                clientId: $clientId,
                eventType: 'numeracao_inutilizada',
                statusNovo: 'inutilizada',
                statusAnterior: null,
                sefazCodigo: $resultado['sefaz_codigo'],
                sefazMotivo: $resultado['sefaz_motivo'],
            ));

            return [
                'inutilizacao_id'   => $inutilizacaoId,
                'protocolo'         => $resultado['protocolo'],
                'data_inutilizacao' => $resultado['data_inutilizacao'],
                'numeros'           => ['ini' => $numeroIni, 'fim' => $numeroFim],
            ];
        });
    }

    private function assertIntervaloValido(int $numeroIni, int $numeroFim): void
    {
        if ($numeroIni > $numeroFim) {
            throw new \InvalidArgumentException('numero_inicial nao pode ser maior que numero_final');
        }
    }
}
