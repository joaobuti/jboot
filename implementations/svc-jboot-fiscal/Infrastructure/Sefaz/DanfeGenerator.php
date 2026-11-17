<?php

namespace Infrastructure\Sefaz;

use NFePHP\DA\NFe\Danfe;
use NFePHP\DA\NFCe\Danfce;
use RuntimeException;

class DanfeGenerator
{
    public function gerar(string $xmlRetorno, string $tipo): string
    {
        return match ($tipo) {
            'nfce' => $this->gerarDanfce($xmlRetorno),
            'nfe'  => $this->gerarDanfe($xmlRetorno),
            default => throw new RuntimeException("Tipo de documento desconhecido para DANFE: {$tipo}"),
        };
    }

    private function gerarDanfe(string $xmlRetorno): string
    {
        $danfe = new Danfe($xmlRetorno);
        $pdf = $danfe->render();

        if (! $pdf) {
            throw new RuntimeException('Falha ao gerar DANFE (NF-e)');
        }

        return $pdf;
    }

    private function gerarDanfce(string $xmlRetorno): string
    {
        $danfce = new Danfce($xmlRetorno);
        $pdf = $danfce->render();

        if (! $pdf) {
            throw new RuntimeException('Falha ao gerar DANFE (NFC-e)');
        }

        return $pdf;
    }
}
