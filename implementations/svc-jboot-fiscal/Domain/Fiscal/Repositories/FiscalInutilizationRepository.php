<?php

namespace Domain\Fiscal\Repositories;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FiscalInutilizationRepository
{
    public function create(array $data): string
    {
        $id = (string) Str::uuid();

        DB::table('fiscal_inutilizations')->insert([
            'id'                  => $id,
            'client_id'           => $data['client_id'],
            'cnpj_emitente'       => $data['cnpj_emitente'],
            'tipo_documento'      => $data['tipo_documento'],
            'serie'               => $data['serie'],
            'numero_inicial'      => $data['numero_inicial'],
            'numero_final'        => $data['numero_final'],
            'justificativa'       => $data['justificativa'],
            'ambiente'            => $data['ambiente'],
            'protocolo'           => $data['protocolo'],
            'data_inutilizacao'   => $data['data_inutilizacao'],
            'xml_retorno'         => $data['xml_retorno'],
            'created_at'          => now(),
        ]);

        return $id;
    }
}
