<?php

namespace Domain\Fiscal\Services;

use Domain\Fiscal\Events\CceRegistrada;
use Domain\Fiscal\Listeners\RegistrarEventoAuditoria;
use Domain\Fiscal\Repositories\FiscalCceRepository;
use Domain\Fiscal\Repositories\FiscalDocumentRepository;
use Infrastructure\Sefaz\SefazGateway;
use Illuminate\Support\Facades\DB;

class CceService
{
    private const MAX_CCE_POR_DOCUMENTO = 20;

    public function __construct(
        private FiscalDocumentRepository $documentos,
        private FiscalCceRepository $cces,
        private CertificateLoader $certLoader,
        private SefazGateway $sefaz,
        private RegistrarEventoAuditoria $auditoria,
    ) {}

    public function registrar(string $clientId, string $documentoId, string $correcao): array
    {
        $doc = $this->documentos->findById($clientId, $documentoId);

        $this->assertTipoPermitido($doc);
        $this->assertStatus($doc);

        $sequencia = $this->cces->contarPorDocumento($documentoId) + 1;
        $this->assertLimiteNaoExcedido($sequencia);

        $pfxBinary = $this->certLoader->loadDecrypted($clientId, $doc->cnpj_emitente, $doc->ambiente);

        return DB::transaction(function () use ($doc, $clientId, $documentoId, $correcao, $sequencia, $pfxBinary) {
            $sefazConfig = $this->buildSefazConfig($doc);
            $resultado = $this->sefaz->cce($sefazConfig, $pfxBinary, '', $doc->chave_acesso, $correcao, $sequencia);

            $cceId = $this->cces->create([
                'fiscal_document_id' => $documentoId,
                'client_id'          => $clientId,
                'sequencia'          => $sequencia,
                'correcao'           => $correcao,
                'protocolo'          => $resultado['protocolo'],
                'data_registro'      => $resultado['data_evento'],
                'xml_retorno'        => $resultado['xml_retorno'],
            ]);

            $this->auditoria->handle(new CceRegistrada(
                documentoId: $documentoId,
                clientId: $clientId,
                eventType: 'cce_registrada',
                statusNovo: $doc->status,
                statusAnterior: $doc->status,
                sefazCodigo: $resultado['sefaz_codigo'],
                sefazMotivo: $resultado['sefaz_motivo'],
            ));

            return [
                'fiscal_document_id' => $documentoId,
                'cce_id'             => $cceId,
                'sequencia'          => $sequencia,
                'protocolo'          => $resultado['protocolo'],
                'data_registro'      => $resultado['data_evento'],
            ];
        });
    }

    private function assertTipoPermitido(object $doc): void
    {
        if ($doc->tipo_documento !== 'nfe') {
            throw new \InvalidArgumentException('CC-e disponivel apenas para NF-e');
        }
    }

    private function assertStatus(object $doc): void
    {
        if ($doc->status !== 'authorized') {
            throw new \InvalidArgumentException("CC-e nao permitida: status '{$doc->status}'");
        }
    }

    private function assertLimiteNaoExcedido(int $sequencia): void
    {
        if ($sequencia > self::MAX_CCE_POR_DOCUMENTO) {
            throw new \InvalidArgumentException('Limite de ' . self::MAX_CCE_POR_DOCUMENTO . ' CC-e por documento atingido');
        }
    }

    private function buildSefazConfig(object $doc): array
    {
        return [
            'cnpj_emitente' => $doc->cnpj_emitente,
            'razao_social'  => '',
            'uf'            => '',
            'ambiente'      => $doc->ambiente,
            'csc'           => '',
            'csc_id'        => '',
            'serie'         => $doc->serie,
        ];
    }
}
