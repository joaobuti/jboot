<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpsertConfigRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'cnpj_emitente'    => ['required', 'string', 'size:14'],
            'ambiente'         => ['required', 'in:homologacao,producao'],
            'razao_social'     => ['required', 'string', 'max:200'],
            'nome_fantasia'    => ['nullable', 'string', 'max:200'],
            'inscricao_estadual' => ['required', 'string', 'max:20'],
            'telefone'         => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'max:200'],
            'address_logradouro' => ['required', 'string', 'max:200'],
            'address_numero'     => ['required', 'string', 'max:20'],
            'address_complemento' => ['nullable', 'string', 'max:100'],
            'address_bairro'     => ['required', 'string', 'max:100'],
            'address_municipio'  => ['required', 'string', 'max:100'],
            'address_uf'         => ['required', 'string', 'size:2'],
            'address_cep'        => ['required', 'string', 'size:8'],
            'address_codigo_municipio' => ['required', 'string', 'size:7'],
            'serie_nfce'       => ['sometimes', 'integer', 'min:1'],
            'serie_nfe'        => ['sometimes', 'integer', 'min:1'],
            'csc'              => ['nullable', 'string', 'min:1'],
            'csc_id'           => ['nullable', 'string', 'min:1'],
            'regime_fiscal'    => ['sometimes', 'in:simples,lucro_presumido,lucro_real'],
            'cfop_padrao_nfce' => ['nullable', 'string', 'size:4'],
            'cfop_padrao_nfe'  => ['nullable', 'string', 'size:4'],
            'icms_origem_padrao' => ['nullable', 'integer', 'min:0', 'max:8'],
            'icms_cst_padrao'  => ['nullable', 'string'],
            'icms_aliquota_padrao' => ['nullable', 'numeric', 'min:0'],
            'pis_cst_padrao'   => ['nullable', 'string'],
            'pis_aliquota_padrao' => ['nullable', 'numeric', 'min:0'],
            'cofins_cst_padrao' => ['nullable', 'string'],
            'cofins_aliquota_padrao' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
