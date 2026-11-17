<?php

use Domain\Fiscal\Builders\NfceBuilder;
use Domain\Fiscal\DTOs\EmissaoNfceDto;

it('includes consumer CPF and product fiscal data in NFC-e XML', function () {
    $dto = EmissaoNfceDto::fromArray([
        'request_id' => '11111111-1111-4111-8111-111111111111',
        'client_id' => '11111111-1111-4111-8111-111111111111',
        'cnpj_emitente' => '00000000000000',
        'dados_documento' => [
            'data_emissao' => '2026-10-11T12:00:00-03:00',
            'presenca' => 1,
            'cpf_consumidor' => '00000000191',
            'emitente' => [
                'cnpj' => '00000000000000', 'razao_social' => 'EMITENTE HOMOLOGACAO',
                'ie' => '000000000000', 'uf' => 'SP', 'crt' => 1,
                'endereco' => [
                    'logradouro' => 'Rua Teste', 'numero' => '1', 'bairro' => 'Centro',
                    'municipio' => 'Sorocaba', 'uf' => 'SP', 'cep' => '18000000',
                    'codigo_municipio' => '3552205',
                ],
            ],
            'itens' => [[
                'codigo' => 'HOMOLOG-001', 'descricao' => 'PARAFUSO DE ACO PARA TESTE EM HOMOLOGACAO',
                'ncm' => '73181500', 'cfop' => '5102', 'unidade' => 'UN',
                'quantidade' => 1, 'valor_unitario' => 1, 'valor_total' => 1,
                'cest' => null,
                'impostos' => ['origem_icms' => 0, 'csosn_icms' => 102, 'cst_pis' => 7, 'cst_cofins' => 7],
            ]],
            'pagamentos' => [['forma_pagamento' => 17, 'valor' => 1]],
            'totais' => ['v_bc' => 0, 'v_icms' => 0, 'v_prod' => 1, 'v_nf' => 1],
        ],
    ]);

    $xml = (new NfceBuilder())->build($dto, 1, 1, 'homologacao')->getXML();

    expect($xml)->toContain('<CPF>00000000191</CPF>')
        ->and($xml)->toContain('<xProd>NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xProd>')
        ->and($xml)->toContain('<NCM>73181500</NCM>')
        ->and($xml)->toContain('<tPag>17</tPag>');
});

