<?php

namespace Infrastructure\Sefaz;

use Domain\Fiscal\Exceptions\SefazRejeicaoException;
use Domain\Fiscal\Exceptions\SefazIndisponivelException;
use NFePHP\NFe\Tools;
use NFePHP\NFe\Make;
use NFePHP\NFe\Complements;
use NFePHP\Common\Certificate;
use NFePHP\Common\Soap\SoapCurl;
use Illuminate\Support\Facades\Log;
use Throwable;

class SefazGateway
{
    private int $timeoutPerAttempt;
    private int $retryMax;
    private int $backoffBaseMs;

    public function __construct()
    {
        $this->timeoutPerAttempt = (int) config('fiscal.sefaz.timeout_per_attempt_ms', 10000);
        $this->retryMax = (int) config('fiscal.sefaz.retry_max', 3);
        $this->backoffBaseMs = (int) config('fiscal.sefaz.retry_backoff_base_ms', 1000);
    }

    public function autorizar(array $config, string $pfxBinary, string $pfxPassword, Make $nfe): array
    {
        $tools = $this->buildTools($config, $pfxBinary, $pfxPassword);

        return $this->withRetry(function () use ($tools, $nfe) {
            $xmlAssinado = $tools->signNFe($nfe->getXML());
            $idLote = (string) now()->format('YmdHisu');
            $response = $tools->sefazEnviaLote([$xmlAssinado], $idLote, 1);

            return $this->parseAutorizacaoResponse($response, $xmlAssinado);
        });
    }

    public function autorizarXmlExistente(array $config, string $pfxBinary, string $xmlAssinado): array
    {
        $tools = $this->buildTools($config, $pfxBinary, '');

        return $this->withRetry(function () use ($tools, $xmlAssinado) {
            $idLote = (string) now()->format('YmdHisu');
            $response = $tools->sefazEnviaLote([$xmlAssinado], $idLote, 1);

            return $this->parseAutorizacaoResponse($response, $xmlAssinado);
        });
    }

    public function cancelar(array $config, string $pfxBinary, string $pfxPassword, string $chaveAcesso, string $protocolo, string $justificativa): array
    {
        $tools = $this->buildTools($config, $pfxBinary, $pfxPassword);

        return $this->withRetry(function () use ($tools, $chaveAcesso, $protocolo, $justificativa) {
            $response = $tools->sefazCancela($chaveAcesso, $justificativa, $protocolo);

            return $this->parseEventoResponse($response);
        });
    }

    public function cce(array $config, string $pfxBinary, string $pfxPassword, string $chaveAcesso, string $correcao, int $sequencia): array
    {
        $tools = $this->buildTools($config, $pfxBinary, $pfxPassword);

        return $this->withRetry(function () use ($tools, $chaveAcesso, $correcao, $sequencia) {
            $response = $tools->sefazCCe($chaveAcesso, $correcao, $sequencia);

            return $this->parseEventoResponse($response);
        });
    }

    public function inutilizar(
        array $config,
        string $pfxBinary,
        string $pfxPassword,
        int $serie,
        int $numeroIni,
        int $numeroFim,
        string $justificativa,
    ): array {
        $tools = $this->buildTools($config, $pfxBinary, $pfxPassword);

        return $this->withRetry(function () use ($tools, $serie, $numeroIni, $numeroFim, $justificativa) {
            $response = $tools->sefazInutiliza($serie, $numeroIni, $numeroFim, $justificativa);

            return $this->parseInutilizacaoResponse($response);
        });
    }

    private function buildTools(array $config, string $pfxBinary, string $pfxPassword): Tools
    {
        $tpAmb = $config['ambiente'] === 'producao' ? 1 : 2;

        $configArray = [
            'atualizacao' => date('Y-m-d H:i:s'),
            'tpAmb' => $tpAmb,
            'razaosocial' => $config['razao_social'],
            'cnpj' => $config['cnpj_emitente'],
            'siglaUF' => $config['uf'],
            'schemes' => 'PL_009_V4',
            'versao' => '4.00',
            'tokenIBPT' => '',
            'CSC' => $config['csc'] ?? '',
            'CSCid' => $config['csc_id'] ?? '',
        ];

        $certificate = Certificate::readPfx($pfxBinary, $pfxPassword);
        $tools = new Tools(json_encode($configArray), $certificate);

        $soap = new SoapCurl();
        $soap->timeout((int) round($this->timeoutPerAttempt / 1000));
        $tools->loadSoapClass($soap); // loadSoapClass calls loadCertificate internally

        return $tools;
    }

    private function withRetry(callable $fn): array
    {
        $attempt = 0;
        $lastException = null;

        while ($attempt < $this->retryMax) {
            try {
                return $fn();
            } catch (SefazRejeicaoException $e) {
                throw $e;
            } catch (Throwable $e) {
                $lastException = $e;
                $attempt++;

                if ($attempt < $this->retryMax) {
                    $sleepMs = $this->backoffBaseMs * (2 ** ($attempt - 1));
                    usleep($sleepMs * 1000);
                    Log::warning('sefaz_retry', ['attempt' => $attempt, 'error' => $e->getMessage()]);
                }
            }
        }

        throw new SefazIndisponivelException(
            'SEFAZ indisponivel apos ' . $this->retryMax . ' tentativas',
            previous: $lastException
        );
    }

    private function parseAutorizacaoResponse(string $response, string $xmlEnviado): array
    {
        $xml = simplexml_load_string($response);
        $cStat = (string) ($xml->protNFe->infProt->cStat ?? $xml->cStat ?? '');
        $xMotivo = (string) ($xml->protNFe->infProt->xMotivo ?? $xml->xMotivo ?? '');
        $protocolo = (string) ($xml->protNFe->infProt->nProt ?? '');
        $dhRecbto = (string) ($xml->protNFe->infProt->dhRecbto ?? '');

        // 100 = autorizado, 150 = autorizado fora do prazo
        if (in_array($cStat, ['100', '150'])) {
            $chaveAcesso = (string) ($xml->protNFe->infProt->chNFe ?? '');
            if ($chaveAcesso === '' && preg_match('/Id="NFe(\d{44})"/', $xmlEnviado, $matches)) {
                $chaveAcesso = $matches[1];
            }
            return [
                'status' => 'authorized',
                'chave_acesso' => $chaveAcesso,
                'protocolo' => $protocolo,
                'data_autorizacao' => $dhRecbto,
                'xml_envio' => $xmlEnviado,
                'xml_retorno' => Complements::toAuthorize($xmlEnviado, $response),
                'sefaz_codigo' => $cStat,
                'sefaz_motivo' => $xMotivo,
            ];
        }

        // 301, 302, 303 = denegada
        if (in_array($cStat, ['301', '302', '303'])) {
            return [
                'status' => 'denegada',
                'xml_retorno' => $response,
                'sefaz_codigo' => $cStat,
                'sefaz_motivo' => $xMotivo,
            ];
        }

        throw new SefazRejeicaoException($cStat, $xMotivo, $response);
    }

    private function parseEventoResponse(string $response): array
    {
        $xml = simplexml_load_string($response);
        $cStat = (string) ($xml->retEvento->infEvento->cStat ?? $xml->cStat ?? '');
        $xMotivo = (string) ($xml->retEvento->infEvento->xMotivo ?? $xml->xMotivo ?? '');
        $protocolo = (string) ($xml->retEvento->infEvento->nProt ?? '');
        $dhRecbto = (string) ($xml->retEvento->infEvento->dhRegEvento ?? '');

        if (in_array($cStat, ['135', '136', '155'])) {
            return [
                'status' => 'authorized',
                'protocolo' => $protocolo,
                'data_evento' => $dhRecbto,
                'xml_retorno' => $response,
                'sefaz_codigo' => $cStat,
                'sefaz_motivo' => $xMotivo,
            ];
        }

        throw new SefazRejeicaoException($cStat, $xMotivo, $response);
    }

    private function parseInutilizacaoResponse(string $response): array
    {
        $xml = simplexml_load_string($response);
        $cStat = (string) ($xml->infInut->cStat ?? $xml->cStat ?? '');
        $xMotivo = (string) ($xml->infInut->xMotivo ?? $xml->xMotivo ?? '');
        $protocolo = (string) ($xml->infInut->nProt ?? '');
        $dhRecbto = (string) ($xml->infInut->dhRecbto ?? '');

        if ($cStat === '102') {
            return [
                'status' => 'authorized',
                'protocolo' => $protocolo,
                'data_inutilizacao' => $dhRecbto,
                'xml_retorno' => $response,
                'sefaz_codigo' => $cStat,
                'sefaz_motivo' => $xMotivo,
            ];
        }

        throw new SefazRejeicaoException($cStat, $xMotivo, $response);
    }
}
