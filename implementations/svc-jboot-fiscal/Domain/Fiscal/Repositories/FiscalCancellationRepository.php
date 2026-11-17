<?php

namespace Domain\Fiscal\Repositories;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FiscalCancellationRepository
{
    public function create(array $data): string
    {
        $id = (string) Str::uuid();

        DB::table('fiscal_cancellations')->insert([
            'id'                  => $id,
            'fiscal_document_id'  => $data['fiscal_document_id'],
            'client_id'           => $data['client_id'],
            'justificativa'       => $data['justificativa'],
            'protocolo'           => $data['protocolo'],
            'data_cancelamento'   => $data['data_cancelamento'],
            'xml_retorno'         => $data['xml_retorno'],
            'created_at'          => now(),
        ]);

        return $id;
    }
}
