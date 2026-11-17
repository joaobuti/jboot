<?php

namespace Domain\Fiscal\Builders;

use Domain\Fiscal\DTOs\EmissaoNfceDto;
use Domain\Fiscal\DTOs\EmitenteDto;
use Domain\Fiscal\DTOs\ItemNfeDto;
use Domain\Fiscal\DTOs\PagamentoDto;
use NFePHP\NFe\Make;

class NfceBuilder
{
    public function build(EmissaoNfceDto $dto, int $numero, int $serie, string $ambiente): Make
    {
        $make = new Make();

        $this->addInfNFe($make, $dto, $numero, $serie, $ambiente);
        $this->addEmitente($make, $dto->emitente);
        $this->addDest($make, $dto->cpfConsumidor);
        foreach ($dto->itens as $seq => $item) {
            $this->addItem($make, $item, $seq + 1);
        }
        $this->addTotais($make, $dto->totais);
        $this->addTransporte($make);
        $this->addGrupoPagamento($make, $dto->pagamentos);
        foreach ($dto->pagamentos as $pag) {
            $this->addPagamento($make, $pag);
        }
        $this->addInfAdic($make);

        return $make;
    }

    private function addInfNFe(Make $make, EmissaoNfceDto $dto, int $numero, int $serie, string $ambiente): void
    {
        $std = new \stdClass();
        $std->versao = '4.00';
        $std->Id = null;
        $std->pk_nItem = null;
        $make->taginfNFe($std);

        $std = new \stdClass();
        $std->cUF = $this->codigoUf($dto->emitente->uf);
        $std->cNF = str_pad((string) random_int(10000000, 99999999), 8, '0', STR_PAD_LEFT);
        $std->natOp = 'Venda a Consumidor';
        $std->mod = 65;
        $std->serie = $serie;
        $std->nNF = $numero;
        $std->dhEmi = $dto->dataEmissao->format('Y-m-d\TH:i:sP');
        $std->tpNF = 1;
        $std->idDest = 1;
        $std->cMunFG = $dto->emitente->endereco->codigoMunicipio;
        $std->tpImp = 4;
        $std->tpEmis = 1;
        $std->cDV = 0;
        $std->tpAmb = $ambiente === 'producao' ? 1 : 2;
        $std->finNFe = 1;
        $std->indFinal = 1;
        $std->indPres = $dto->presenca;
        $std->indIntermed = null;
        $std->procEmi = 0;
        $std->verProc = '1.0.0';
        $make->tagide($std);
    }

    private function addEmitente(Make $make, EmitenteDto $emitente): void
    {
        $std = new \stdClass();
        $std->CNPJ = $emitente->cnpj;
        $std->xNome = $emitente->razaoSocial;
        $std->xFant = $emitente->nomeFantasia ?? $emitente->razaoSocial;
        $std->IE = $emitente->ie ?? '';
        $std->CRT = $emitente->crt;
        $make->tagemit($std);

        $std = new \stdClass();
        $std->xLgr = $emitente->endereco->logradouro;
        $std->nro = $emitente->endereco->numero;
        $std->xCpl = $emitente->endereco->complemento;
        $std->xBairro = $emitente->endereco->bairro;
        $std->cMun = $emitente->endereco->codigoMunicipio;
        $std->xMun = $emitente->endereco->municipio;
        $std->UF = $emitente->endereco->uf;
        $std->CEP = $emitente->endereco->cep;
        $std->cPais = $emitente->endereco->codigoPais;
        $std->xPais = $emitente->endereco->pais;
        $std->fone = $emitente->endereco->telefone;
        $make->tagenderEmit($std);
    }

    private function addDest(Make $make, ?string $cpfConsumidor): void
    {
        $std = new \stdClass();
        $std->CPF = $cpfConsumidor;
        $std->indIEDest = 9;
        $std->email = null;
        $make->tagdest($std);
    }

    private function addItem(Make $make, ItemNfeDto $item, int $nItem): void
    {
        $std = new \stdClass();
        $std->item = $nItem;
        $make->tagprod($std);

        $std = new \stdClass();
        $std->item = $nItem;
        $std->cProd = $item->codigo;
        $std->cEAN = $item->gtin;
        $std->xProd = $item->descricao;
        $std->NCM = $item->ncm;
        $std->CEST = $item->cest;
        $std->CFOP = $item->cfop;
        $std->uCom = $item->unidade;
        $std->qCom = number_format($item->quantidade, 4, '.', '');
        $std->vUnCom = number_format($item->valorUnitario, 10, '.', '');
        $std->vProd = number_format($item->valorTotal, 2, '.', '');
        $std->cEANTrib = $item->gtinTributavel;
        $std->uTrib = $item->unidade;
        $std->qTrib = number_format($item->quantidade, 4, '.', '');
        $std->vUnTrib = number_format($item->valorUnitario, 10, '.', '');
        $std->indTot = $item->indTot;
        $make->tagprod($std);

        $this->addImpostos($make, $item, $nItem);
    }

    private function addImpostos(Make $make, ItemNfeDto $item, int $nItem): void
    {
        $impostos = $item->impostos;

        $std = new \stdClass();
        $std->item = $nItem;
        $make->tagimposto($std);

        $std = new \stdClass();
        $std->item = $nItem;
        $std->orig = $impostos?->origemIcms ?? 0;
        $std->CSOSN = $impostos?->csosnIcms ?? 400;
        $make->tagICMSSN($std);

        $std = new \stdClass();
        $std->item = $nItem;
        $std->CST = str_pad((string) ($impostos?->cstPis ?? 7), 2, '0', STR_PAD_LEFT);
        $std->vBC = number_format($impostos?->vBC ?? 0, 2, '.', '');
        $std->pPIS = number_format($impostos?->pPIS ?? 0, 4, '.', '');
        $std->vPIS = number_format($impostos?->vPIS ?? 0, 2, '.', '');
        $make->tagPIS($std);

        $std = new \stdClass();
        $std->item = $nItem;
        $std->CST = str_pad((string) ($impostos?->cstCofins ?? 7), 2, '0', STR_PAD_LEFT);
        $std->vBC = number_format($impostos?->vBC ?? 0, 2, '.', '');
        $std->pCOFINS = number_format($impostos?->pCOFINS ?? 0, 4, '.', '');
        $std->vCOFINS = number_format($impostos?->vCOFINS ?? 0, 2, '.', '');
        $make->tagCOFINS($std);
    }

    private function addTotais(Make $make, \Domain\Fiscal\DTOs\TotaisDto $totais): void
    {
        $std = new \stdClass();
        $std->vBC = number_format($totais->vBC, 2, '.', '');
        $std->vICMS = number_format($totais->vICMS, 2, '.', '');
        $std->vICMSDeson = '0.00';
        $std->vFCP = '0.00';
        $std->vBCST = '0.00';
        $std->vST = '0.00';
        $std->vFCPST = '0.00';
        $std->vFCPSTRet = '0.00';
        $std->vProd = number_format($totais->vProd, 2, '.', '');
        $std->vFrete = number_format($totais->vFrete, 2, '.', '');
        $std->vSeg = number_format($totais->vSeg, 2, '.', '');
        $std->vDesc = number_format($totais->vDesc, 2, '.', '');
        $std->vII = '0.00';
        $std->vIPI = '0.00';
        $std->vIPIDevol = '0.00';
        $std->vPIS = number_format($totais->vPIS, 2, '.', '');
        $std->vCOFINS = number_format($totais->vCOFINS, 2, '.', '');
        $std->vOutro = number_format($totais->vOutro, 2, '.', '');
        $std->vNF = number_format($totais->vNF, 2, '.', '');
        $std->vTotTrib = null;
        $make->tagICMSTot($std);
    }

    private function addTransporte(Make $make): void
    {
        $std = new \stdClass();
        $std->modFrete = 9;
        $make->tagtransp($std);
    }

    private function addPagamento(Make $make, PagamentoDto $pag): void
    {
        $std = new \stdClass();
        $std->tPag = str_pad((string) $pag->formaPagamento, 2, '0', STR_PAD_LEFT);
        $std->vPag = number_format($pag->valor, 2, '.', '');
        $std->indPag = 0;
        $make->tagdetPag($std);
    }

    /** @param PagamentoDto[] $pagamentos */
    private function addGrupoPagamento(Make $make, array $pagamentos): void
    {
        $troco = array_sum(array_map(static fn (PagamentoDto $pag) => $pag->troco ?? 0.0, $pagamentos));
        $std = new \stdClass();
        $std->vTroco = $troco > 0 ? number_format($troco, 2, '.', '') : null;
        $make->tagpag($std);
    }

    private function addInfAdic(Make $make): void
    {
        $std = new \stdClass();
        $std->infCpl = null;
        $std->infAdFisco = null;
        $make->taginfAdic($std);
    }

    private function codigoUf(string $uf): int
    {
        return match (strtoupper($uf)) {
            'RO' => 11, 'AC' => 12, 'AM' => 13, 'RR' => 14, 'PA' => 15,
            'AP' => 16, 'TO' => 17, 'MA' => 21, 'PI' => 22, 'CE' => 23,
            'RN' => 24, 'PB' => 25, 'PE' => 26, 'AL' => 27, 'SE' => 28,
            'BA' => 29, 'MG' => 31, 'ES' => 32, 'RJ' => 33, 'SP' => 35,
            'PR' => 41, 'SC' => 42, 'RS' => 43, 'MS' => 50, 'MT' => 51,
            'GO' => 52, 'DF' => 53,
            default => throw new \InvalidArgumentException("UF inválida: {$uf}"),
        };
    }
}
