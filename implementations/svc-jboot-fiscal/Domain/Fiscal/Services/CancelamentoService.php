<?php

namespace Domain\Fiscal\Services;

use Domain\Fiscal\Events\DocumentoCancelado;
use Domain\Fiscal\Exceptions\DocumentoNaoEncontradoException;
use Domain\Fiscal\Listeners\RegistrarEventoAuditoria;
use Domain\Fiscal\Repositories\FiscalCancellationRepository;
use Domain\Fiscal\Repositories\FiscalDocumentRepository;
use Infrastructure\Sefaz\SefazGateway;
use Illuminate\Support\Facades\DB;

class CancelamentoService
{
    private const PRAZO_HORAS_NFCE = 24;
    private const PRAZO_HORAS_NFE = 168;

    public function __construct(
        private FiscalDocumentRepository $documentos,
        private FiscalCancellationRepository $cancelamentos,
        private CertificateLoader $certLoader,
        private SefazGateway $sefaz,
        private RegistrarEventoAuditoria $auditoria,
    ) {}

    public function cancelar(string $clientId, string $documentoId, string $justificativa): array
    {
        $doc = $this->documentos->findById($clientId, $documentoId);

        $this->assertStatus($doc, 'authorized');
        $this->assertDentroDoPrazo($doc);

        $pfxBinary = $this->certLoader->loadDecrypted($clientId, $doc->cnpj_emitente, $doc->ambiente);

        return DB::transaction(function () use ($doc, $clientId, $documentoId, $justificativa, $pfxBinary) {
            $sefazConfig = $this->buildSefazConfig($doc);
            $resultado = $this->sefaz->cancelar($sefazConfig, $pfxBinary, '', $doc->chave_acesso, $doc->protocolo, $justificativa);

            $this->documentos->updateStatus($documentoId, 'cancelled', [
                'xml_retorno' => $resultado['xml_retorno'],
            ]);

            $cancelamentoId = $this->cancelamentos->create([
                'fiscal_document_id' => $documentoId,
                'client_id'          => $clientId,
                'justificativa'      => $justificativa,
                'protocolo'          => $resultado['protocolo'],
                'data_cancelamento'  => $resultado['data_evento'],
                'xml_retorno'        => $resultado['xml_retorno'],
            ]);

            $this->auditoria->handle(new DocumentoCancelado(
                documentoId: $documentoId,
                clientId: $clientId,
                eventType: 'cancelado',
                statusNovo: 'cancelled',
                statusAnterior: 'authorized',
                sefazCodigo: $resultado['sefaz_codigo'],
                sefazMotivo: $resultado['sefaz_motivo'],
            ));

            return [
                'fiscal_document_id' => $documentoId,
                'cancelamento_id'    => $cancelamentoId,
                'status'             => 'cancelled',
                'protocolo'          => $resultado['protocolo'],
                'data_cancelamento'  => $resultado['data_evento'],
            ];
        });
    }

    private function assertStatus(object $doc, string $esperado): void
    {
        if ($doc->status !== $esperado) {
            throw new \InvalidArgumentException("Documento nao pode ser cancelado: status atual '{$doc->status}'");
        }
    }

    private function assertDentroDoPrazo(object $doc): void
    {
        $horas = $doc->tipo_documento === 'nfce' ? self::PRAZO_HORAS_NFCE : self::PRAZO_HORAS_NFE;
        $prazo = \Carbon\Carbon::parse($doc->data_autorizacao)->addHours($horas);

        if (now()->isAfter($prazo)) {
            throw new \InvalidArgumentException("Prazo de cancelamento expirado para {$doc->tipo_documento} ({$horas}h)");
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
