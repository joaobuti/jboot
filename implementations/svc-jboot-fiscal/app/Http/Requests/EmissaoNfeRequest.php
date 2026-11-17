<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class EmissaoNfeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'request_id'                          => ['required', 'uuid'],
            'cnpj_emitente'                       => ['required', 'string', 'size:14'],

            'dados_documento'                     => ['required', 'array'],
            'dados_documento.data_emissao'        => ['required', 'date'],
            'dados_documento.natureza_operacao'   => ['required', 'string', 'max:60'],
            'dados_documento.finalidade'          => ['required', 'integer', 'in:1,2,3,4'],
            'dados_documento.consumidor_final'    => ['required', 'boolean'],
            'dados_documento.presenca'            => ['required', 'integer'],

            'dados_documento.emitente'            => ['required', 'array'],
            'dados_documento.emitente.cnpj'       => ['required', 'string', 'size:14'],
            'dados_documento.emitente.razao_social' => ['required', 'string'],
            'dados_documento.emitente.ie'         => ['required', 'string'],
            'dados_documento.emitente.uf'         => ['required', 'string', 'size:2'],
            'dados_documento.emitente.crt'        => ['required', 'integer', 'in:1,2,3'],
            'dados_documento.emitente.endereco'   => ['required', 'array'],
            'dados_documento.emitente.endereco.logradouro'       => ['required', 'string'],
            'dados_documento.emitente.endereco.numero'           => ['required', 'string'],
            'dados_documento.emitente.endereco.bairro'           => ['required', 'string'],
            'dados_documento.emitente.endereco.municipio'        => ['required', 'string'],
            'dados_documento.emitente.endereco.uf'               => ['required', 'string', 'size:2'],
            'dados_documento.emitente.endereco.cep'              => ['required', 'string', 'size:8'],
            'dados_documento.emitente.endereco.codigo_municipio' => ['required', 'string'],
            'dados_documento.emitente.endereco.complemento' => ['nullable', 'string'],
            'dados_documento.emitente.endereco.telefone' => ['nullable', 'string'],

            'dados_documento.destinatario'        => ['nullable', 'array'],
            'dados_documento.destinatario.razao_social'          => ['required_with:dados_documento.destinatario', 'string'],
            'dados_documento.destinatario.cnpj'                  => ['nullable', 'string', 'size:14'],
            'dados_documento.destinatario.cpf'                   => ['nullable', 'string', 'size:11'],
            'dados_documento.destinatario.endereco'              => ['required_with:dados_documento.destinatario', 'array'],

            'dados_documento.itens'               => ['required', 'array', 'min:1'],
            'dados_documento.itens.*.codigo'      => ['required', 'string'],
            'dados_documento.itens.*.descricao'   => ['required', 'string'],
            'dados_documento.itens.*.ncm'         => ['required', 'string'],
            'dados_documento.itens.*.cfop'        => ['nullable', 'string', 'size:4'],
            'dados_documento.itens.*.unidade'     => ['required', 'string'],
            'dados_documento.itens.*.quantidade'  => ['required', 'numeric', 'min:0.001'],
            'dados_documento.itens.*.valor_unitario' => ['required', 'numeric', 'min:0'],
            'dados_documento.itens.*.valor_total' => ['required', 'numeric', 'min:0'],

            'dados_documento.pagamentos'          => ['required', 'array', 'min:1'],
            'dados_documento.pagamentos.*.forma_pagamento' => ['required', 'integer'],
            'dados_documento.pagamentos.*.valor'  => ['required', 'numeric', 'min:0.01'],

            'dados_documento.totais'              => ['required', 'array'],
            'dados_documento.totais.v_bc'         => ['required', 'numeric', 'min:0'],
            'dados_documento.totais.v_icms'       => ['required', 'numeric', 'min:0'],
            'dados_documento.totais.v_prod'       => ['required', 'numeric', 'min:0'],
            'dados_documento.totais.v_nf'         => ['required', 'numeric', 'min:0'],
        ];
    }
}
