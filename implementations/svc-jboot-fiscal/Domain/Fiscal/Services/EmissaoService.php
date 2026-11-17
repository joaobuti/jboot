<?php

namespace Domain\Fiscal\Services;

use Domain\Fiscal\Builders\NfceBuilder;
use Domain\Fiscal\Builders\NfeBuilder;
use Domain\Fiscal\DTOs\EmissaoNfceDto;
use Domain\Fiscal\DTOs\EmissaoNfeDto;
use Domain\Fiscal\DTOs\ImpostosItemDto;
use Domain\Fiscal\DTOs\ItemNfeDto;
use Domain\Fiscal\Exceptions\SefazIndisponivelException;
use Domain\Fiscal\Events\ContingenciaAtivada;
use Domain\Fiscal\Events\DocumentoAutorizado;
use Domain\Fiscal\Exceptions\CfopRequiredException;
use Domain\Fiscal\Exceptions\FiscalConfigNotFoundException;
use Domain\Fiscal\Listeners\RegistrarEventoAuditoria;
use Domain\Fiscal\Repositories\FiscalDocumentRepository;
use Domain\Fiscal\Repositories\FiscalSequenceRepository;
use Domain\Fiscal\Repositories\FiscalTenantConfigRepository;
use Infrastructure\Sefaz\DanfeGenerator;
use Infrastructure\Sefaz\SefazGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request;

class EmissaoService
{
    public function __construct(
        private FiscalDocumentRepository $documentos,
        private FiscalSequenceRepository $sequencias,
        private FiscalTenantConfigRepository $configs,
        private CertificateLoader $certLoader,
        private SefazGateway $sefaz,
        private DanfeGenerator $danfe,
        private RegistrarEventoAuditoria $auditoria,
        private NfceBuilder $nfceBuilder,
        private NfeBuilder $nfeBuilder,
    ) {}

    public function emitirNfce(EmissaoNfceDto $dto): array
    {
        $existente = $this->documentos->findByRequestId($dto->clientId, $dto->requestId);
        if ($existente) {
            return $this->responseFromDoc($existente, deduplicated: true);
        }

        $config = $this->configs->findByClientAndCnpj($dto->clientId, $dto->cnpjEmitente);
        if (!$config) {
            throw new FiscalConfigNotFoundException($dto->cnpjEmitente);
        }

        $serie    = (int) $config->serie_nfce;
        $ambiente = $config->ambiente;
        $itens    = $this->aplicarDefaultsFiscais($dto->itens, $config, $config->cfop_padrao_nfce);

        $pfxBinary = $this->certLoader->loadDecrypted($dto->clientId, $dto->cnpjEmitente, $ambiente);

        $prepared = DB::transaction(function () use ($dto, $config, $serie, $ambiente, $itens) {
            $this->lockIdempotencyKey($dto->clientId, $dto->requestId);
            $existente = $this->documentos->findByRequestId($dto->clientId, $dto->requestId);
            if ($existente) {
                return ['existing' => $existente];
            }
            $numero = $this->sequencias->nextNumber(
                $dto->clientId, $dto->cnpjEmitente, 'nfce', $serie, $ambiente
            );

            $dtoComItens = $this->dtoWithItens($dto, $itens);
            $make = $this->nfceBuilder->build($dtoComItens, $numero, $serie, $ambiente);

            $documentoId = $this->documentos->createPending([
                'request_id'     => $dto->requestId,
                'client_id'      => $dto->clientId,
                'cnpj_emitente'  => $dto->cnpjEmitente,
                'tipo_documento' => 'nfce',
                'serie'          => $serie,
                'numero'         => $numero,
                'uf_emitente'    => $dto->emitente->uf,
                'ambiente'       => $ambiente,
                'data_emissao'   => $dto->dataEmissao->format('Y-m-d H:i:s'),
                'xml_envio'      => '',
                'ip_origem'      => Request::ip(),
                'caller_service' => Request::header('X-Caller-Service'),
            ]);

            $sefazConfig = $this->buildSefazConfig(
                $dto->cnpjEmitente, $dto->emitente->razaoSocial, $dto->emitente->uf,
                $ambiente, (string) $config->csc, (string) $config->csc_id, $serie
            );

            return ['documento_id' => $documentoId, 'make' => $make, 'sefaz_config' => $sefazConfig];
        });

        if (isset($prepared['existing'])) {
            return $this->responseFromDoc($prepared['existing'], deduplicated: true);
        }

        return $this->transmitirEFinalizar(
            $prepared['documento_id'], $dto->clientId, $prepared['make'],
            $prepared['sefaz_config'], $pfxBinary, 'nfce'
        );
    }

    public function emitirNfe(EmissaoNfeDto $dto): array
    {
        $existente = $this->documentos->findByRequestId($dto->clientId, $dto->requestId);
        if ($existente) {
            return $this->responseFromDoc($existente, deduplicated: true);
        }

        $config = $this->configs->findByClientAndCnpj($dto->clientId, $dto->cnpjEmitente);
        if (!$config) {
            throw new FiscalConfigNotFoundException($dto->cnpjEmitente);
        }

        $serie    = (int) $config->serie_nfe;
        $ambiente = $config->ambiente;
        $itens    = $this->aplicarDefaultsFiscais($dto->itens, $config, $config->cfop_padrao_nfe);

        $pfxBinary = $this->certLoader->loadDecrypted($dto->clientId, $dto->cnpjEmitente, $ambiente);

        $prepared = DB::transaction(function () use ($dto, $config, $serie, $ambiente, $itens) {
            $this->lockIdempotencyKey($dto->clientId, $dto->requestId);
            $existente = $this->documentos->findByRequestId($dto->clientId, $dto->requestId);
            if ($existente) {
                return ['existing' => $existente];
            }
            $numero = $this->sequencias->nextNumber(
                $dto->clientId, $dto->cnpjEmitente, 'nfe', $serie, $ambiente
            );

            $dtoComItens = $this->dtoWithItens($dto, $itens);
            $make = $this->nfeBuilder->build($dtoComItens, $numero, $serie, $ambiente);

            $documentoId = $this->documentos->createPending([
                'request_id'     => $dto->requestId,
                'client_id'      => $dto->clientId,
                'cnpj_emitente'  => $dto->cnpjEmitente,
                'tipo_documento' => 'nfe',
                'serie'          => $serie,
                'numero'         => $numero,
                'uf_emitente'    => $dto->emitente->uf,
                'ambiente'       => $ambiente,
                'data_emissao'   => $dto->dataEmissao->format('Y-m-d H:i:s'),
                'xml_envio'      => '',
                'ip_origem'      => Request::ip(),
                'caller_service' => Request::header('X-Caller-Service'),
            ]);

            $sefazConfig = $this->buildSefazConfig(
                $dto->cnpjEmitente, $dto->emitente->razaoSocial, $dto->emitente->uf,
                $ambiente, (string) $config->csc, (string) $config->csc_id, $serie
            );

            return ['documento_id' => $documentoId, 'make' => $make, 'sefaz_config' => $sefazConfig];
        });

        if (isset($prepared['existing'])) {
            return $this->responseFromDoc($prepared['existing'], deduplicated: true);
        }

        return $this->transmitirEFinalizar(
            $prepared['documento_id'], $dto->clientId, $prepared['make'],
            $prepared['sefaz_config'], $pfxBinary, 'nfe'
        );
    }

    private function lockIdempotencyKey(string $clientId, string $requestId): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ["{$clientId}:{$requestId}"]);
    }

    /**
     * @param ItemNfeDto[] $itens
     * @return ItemNfeDto[]
     */
    private function resolverCfop(array $itens, ?string $cfopPadrao): array
    {
        return array_map(function (ItemNfeDto $item, int $idx) use ($cfopPadrao) {
            if ($item->cfop !== null) {
                return $item;
            }
            if ($cfopPadrao !== null) {
                return $item->withCfop($cfopPadrao);
            }
            throw new CfopRequiredException($idx + 1);
        }, $itens, array_keys($itens));
    }

    /**
     * @param ItemNfeDto[] $itens
     * @return ItemNfeDto[]
     */
    private function aplicarDefaultsFiscais(array $itens, object $config, ?string $cfopPadrao): array
    {
        $itens = $this->resolverCfop($itens, $cfopPadrao);

        return array_map(function (ItemNfeDto $item) use ($config) {
            $impostos = $item->impostos ?? new ImpostosItemDto();

            return $item->withImpostos(new ImpostosItemDto(
                vBC: $impostos->vBC,
                pICMS: $impostos->pICMS ?: (float) ($config->icms_aliquota_padrao ?? 0),
                vICMS: $impostos->vICMS,
                origemIcms: $impostos->origemIcms ?: (int) ($config->icms_origem_padrao ?? 0),
                cstIcms: $impostos->cstIcms ?: (int) ($config->icms_cst_padrao ?? 0),
                csosnIcms: $impostos->csosnIcms ?: (int) ($config->icms_cst_padrao ?? 400),
                pPIS: $impostos->pPIS ?: (float) ($config->pis_aliquota_padrao ?? 0),
                vPIS: $impostos->vPIS,
                cstPis: $impostos->cstPis ?: (int) ($config->pis_cst_padrao ?? 7),
                pCOFINS: $impostos->pCOFINS ?: (float) ($config->cofins_aliquota_padrao ?? 0),
                vCOFINS: $impostos->vCOFINS,
                cstCofins: $impostos->cstCofins ?: (int) ($config->cofins_cst_padrao ?? 7),
            ));
        }, $itens);
    }

    private function dtoWithItens(EmissaoNfceDto|EmissaoNfeDto $dto, array $itens): EmissaoNfceDto|EmissaoNfeDto
    {
        if ($dto instanceof EmissaoNfceDto) {
            return new EmissaoNfceDto(
                requestId: $dto->requestId,
                clientId: $dto->clientId,
                cnpjEmitente: $dto->cnpjEmitente,
                emitente: $dto->emitente,
                dataEmissao: $dto->dataEmissao,
                itens: $itens,
                pagamentos: $dto->pagamentos,
                totais: $dto->totais,
                presenca: $dto->presenca,
                cpfConsumidor: $dto->cpfConsumidor,
            );
        }

        return new EmissaoNfeDto(
            requestId: $dto->requestId,
            clientId: $dto->clientId,
            cnpjEmitente: $dto->cnpjEmitente,
            emitente: $dto->emitente,
            dataEmissao: $dto->dataEmissao,
            itens: $itens,
            pagamentos: $dto->pagamentos,
            totais: $dto->totais,
            naturezaOperacao: $dto->naturezaOperacao,
            finalidade: $dto->finalidade,
            consumidorFinal: $dto->consumidorFinal,
            presenca: $dto->presenca,
            destinatario: $dto->destinatario,
        );
    }

    private function transmitirEFinalizar(
        string $documentoId,
        string $clientId,
        \NFePHP\NFe\Make $make,
        array $sefazConfig,
        string $pfxBinary,
        string $tipo,
    ): array {
        try {
            $resultado = $this->sefaz->autorizar($sefazConfig, $pfxBinary, '', $make);

            $this->documentos->updateStatus($documentoId, $resultado['status'], [
                'chave_acesso'    => $resultado['chave_acesso'] ?? null,
                'protocolo'       => $resultado['protocolo'] ?? null,
                'data_autorizacao' => $resultado['data_autorizacao'] ?? null,
                'xml_envio'       => $resultado['xml_envio'],
                'xml_retorno'     => $resultado['xml_retorno'],
            ]);

            $this->auditoria->handle(new DocumentoAutorizado(
                documentoId: $documentoId,
                clientId: $clientId,
                eventType: 'autorizado',
                statusNovo: $resultado['status'],
                statusAnterior: 'pending',
                sefazCodigo: $resultado['sefaz_codigo'],
                sefazMotivo: $resultado['sefaz_motivo'],
            ));

            $danfePdf = $this->danfe->gerar($resultado['xml_retorno'], $tipo);

            $this->documentos->updateStatus($documentoId, $resultado['status'], [
                'danfe_pdf' => $danfePdf,
            ]);

            $doc = $this->documentos->findById($clientId, $documentoId);

            return $this->responseFromDoc($doc);
        } catch (SefazIndisponivelException) {
            $this->documentos->updateStatus($documentoId, 'contingency', [
                'contingencia_tipo' => 'dpec',
                'contingencia_data' => now(),
            ]);

            $this->auditoria->handle(new ContingenciaAtivada(
                documentoId: $documentoId,
                clientId: $clientId,
                eventType: 'contingencia_ativada',
                statusNovo: 'contingency',
                statusAnterior: 'pending',
            ));

            return [
                'fiscal_document_id' => $documentoId,
                'status'             => 'contingency',
                'contingencia_tipo'  => 'dpec',
                'mensagem'           => 'SEFAZ indisponivel. Documento em contingencia DPEC.',
            ];
        }
    }

    private function buildSefazConfig(
        string $cnpj,
        string $razaoSocial,
        string $uf,
        string $ambiente,
        string $csc,
        string $cscId,
        int $serie,
    ): array {
        return [
            'cnpj_emitente' => $cnpj,
            'razao_social'  => $razaoSocial,
            'uf'            => $uf,
            'ambiente'      => $ambiente,
            'csc'           => $csc,
            'csc_id'        => $cscId,
            'serie'         => $serie,
        ];
    }

    private function responseFromDoc(object $doc, bool $deduplicated = false): array
    {
        return [
            'fiscal_document_id' => $doc->id,
            'request_id'         => $doc->request_id,
            'chave_acesso'       => $doc->chave_acesso,
            'protocolo'          => $doc->protocolo,
            'status'             => $doc->status,
            'data_autorizacao'   => $doc->data_autorizacao,
            'danfe_pdf_base64'   => $doc->danfe_pdf ? base64_encode(stream_get_contents($doc->danfe_pdf)) : null,
            'deduplicated'       => $deduplicated,
        ];
    }
}
