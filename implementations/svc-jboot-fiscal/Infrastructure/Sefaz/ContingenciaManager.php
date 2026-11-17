<?php

namespace Infrastructure\Sefaz;

use Domain\Fiscal\Builders\NfceBuilder;
use Domain\Fiscal\Builders\NfeBuilder;
use Domain\Fiscal\Events\DocumentoAutorizado;
use Domain\Fiscal\Events\DocumentoRejeitado;
use Domain\Fiscal\Exceptions\SefazIndisponivelException;
use Domain\Fiscal\Exceptions\SefazRejeicaoException;
use Domain\Fiscal\Listeners\RegistrarEventoAuditoria;
use Domain\Fiscal\Repositories\FiscalDocumentRepository;
use Domain\Fiscal\Services\CertificateLoader;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ContingenciaManager
{
    public function __construct(
        private FiscalDocumentRepository $documentos,
        private CertificateLoader $certLoader,
        private SefazGateway $sefaz,
        private DanfeGenerator $danfe,
        private RegistrarEventoAuditoria $auditoria,
        private NfceBuilder $nfceBuilder,
        private NfeBuilder $nfeBuilder,
    ) {}

    public function reenviarPendentes(): void
    {
        $pendentes = $this->documentos->findPendingContingency();

        foreach ($pendentes as $doc) {
            $this->tentarReenvio($doc);
        }
    }

    private function tentarReenvio(object $doc): void
    {
        try {
            $pfxBinary = $this->certLoader->loadDecrypted($doc->client_id, $doc->cnpj_emitente, $doc->ambiente);

            DB::transaction(function () use ($doc, $pfxBinary) {
                $sefazConfig = $this->buildSefazConfig($doc);
                $xmlOriginal = $doc->xml_envio;

                $resultado = $this->sefaz->autorizarXmlExistente($sefazConfig, $pfxBinary, $xmlOriginal);

                $this->documentos->updateStatus($doc->id, $resultado['status'], [
                    'chave_acesso'     => $resultado['chave_acesso'] ?? null,
                    'protocolo'        => $resultado['protocolo'] ?? null,
                    'data_autorizacao' => $resultado['data_autorizacao'] ?? null,
                    'xml_retorno'      => $resultado['xml_retorno'],
                ]);

                $danfePdf = $this->danfe->gerar($resultado['xml_retorno'], $doc->tipo_documento);
                $this->documentos->updateStatus($doc->id, $resultado['status'], ['danfe_pdf' => $danfePdf]);

                $this->auditoria->handle(new DocumentoAutorizado(
                    documentoId: $doc->id,
                    clientId: $doc->client_id,
                    eventType: 'reenvio_autorizado',
                    statusNovo: $resultado['status'],
                    statusAnterior: 'contingency',
                    sefazCodigo: $resultado['sefaz_codigo'],
                    sefazMotivo: $resultado['sefaz_motivo'],
                ));

                Log::info('contingencia_reenvio_sucesso', ['documento_id' => $doc->id]);
            });
        } catch (SefazRejeicaoException $e) {
            $this->documentos->updateStatus($doc->id, 'rejected', ['xml_retorno' => $e->getXmlRetorno()]);
            $this->documentos->incrementRetry($doc->id);

            $this->auditoria->handle(new DocumentoRejeitado(
                documentoId: $doc->id,
                clientId: $doc->client_id,
                eventType: 'reenvio_rejeitado',
                statusNovo: 'rejected',
                statusAnterior: 'contingency',
                sefazCodigo: $e->getSefazCodigo(),
                sefazMotivo: $e->getSefazMotivo(),
            ));

            Log::warning('contingencia_reenvio_rejeitado', ['documento_id' => $doc->id, 'codigo' => $e->getSefazCodigo()]);
        } catch (SefazIndisponivelException $e) {
            $this->documentos->incrementRetry($doc->id);
            Log::warning('contingencia_reenvio_indisponivel', ['documento_id' => $doc->id]);
        } catch (\Throwable $e) {
            $this->documentos->incrementRetry($doc->id);
            Log::error('contingencia_reenvio_erro', ['documento_id' => $doc->id, 'error' => $e->getMessage()]);
        }
    }

    private function buildSefazConfig(object $doc): array
    {
        return [
            'cnpj_emitente' => $doc->cnpj_emitente,
            'razao_social'  => '',
            'uf'            => $doc->uf_emitente,
            'ambiente'      => $doc->ambiente,
            'csc'           => '',
            'csc_id'        => '',
            'serie'         => $doc->serie,
        ];
    }
}
