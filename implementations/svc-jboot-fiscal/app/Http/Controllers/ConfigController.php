<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpsertConfigRequest;
use Domain\Fiscal\Repositories\FiscalTenantConfigRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConfigController extends Controller
{
    public function __construct(private FiscalTenantConfigRepository $configs) {}

    public function show(Request $request): JsonResponse
    {
        $clientId = $request->get('_client_id');
        $cnpj = $request->query('cnpj_emitente');

        if ($cnpj) {
            $config = $this->configs->findByClientAndCnpj($clientId, $cnpj);
            if (!$config) {
                return response()->json(['error' => 'fiscal_config_not_found'], 404);
            }
            return response()->json($this->toResponse($config));
        }

        $configs = $this->configs->findAllByClient($clientId);
        return response()->json(array_map(fn ($c) => $this->toResponse($c), $configs));
    }

    public function upsert(UpsertConfigRequest $request): JsonResponse
    {
        $config = $this->configs->upsert(
            $request->get('_client_id'),
            $request->validated()
        );

        return response()->json($this->toResponse($config));
    }

    private function toResponse(object $config): array
    {
        return [
            'cnpj_emitente'    => $config->cnpj_emitente,
            'ambiente'         => $config->ambiente,
            'razao_social'     => $config->razao_social,
            'nome_fantasia'    => $config->nome_fantasia,
            'inscricao_estadual' => $config->inscricao_estadual,
            'telefone'         => $config->telefone,
            'email'            => $config->email,
            'address_logradouro' => $config->address_logradouro,
            'address_numero'     => $config->address_numero,
            'address_complemento' => $config->address_complemento,
            'address_bairro'     => $config->address_bairro,
            'address_municipio'  => $config->address_municipio,
            'address_uf'         => $config->address_uf,
            'address_cep'        => $config->address_cep,
            'address_codigo_municipio' => $config->address_codigo_municipio,
            'serie_nfce'       => (int) $config->serie_nfce,
            'serie_nfe'        => (int) $config->serie_nfe,
            'csc_configured'   => filled($config->csc),
            'csc_id'           => $config->csc_id,
            'regime_fiscal'    => $config->regime_fiscal,
            'cfop_padrao_nfce' => $config->cfop_padrao_nfce,
            'cfop_padrao_nfe'  => $config->cfop_padrao_nfe,
            'icms_origem_padrao' => $config->icms_origem_padrao,
            'icms_cst_padrao'  => $config->icms_cst_padrao,
            'icms_aliquota_padrao' => $config->icms_aliquota_padrao !== null ? (float) $config->icms_aliquota_padrao : null,
            'pis_cst_padrao'   => $config->pis_cst_padrao,
            'pis_aliquota_padrao' => $config->pis_aliquota_padrao !== null ? (float) $config->pis_aliquota_padrao : null,
            'cofins_cst_padrao' => $config->cofins_cst_padrao,
            'cofins_aliquota_padrao' => $config->cofins_aliquota_padrao !== null ? (float) $config->cofins_aliquota_padrao : null,
        ];
    }
}
