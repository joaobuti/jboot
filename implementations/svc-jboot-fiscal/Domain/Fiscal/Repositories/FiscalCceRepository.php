<?php

namespace Domain\Fiscal\Repositories;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FiscalCceRepository
{
    public function contarPorDocumento(string $documentoId): int
    {
        return (int) DB::table('fiscal_cce')->where('fiscal_document_id', $documentoId)->count();
    }

    public function create(array $data): string
    {
        $id = (string) Str::uuid();

        DB::table('fiscal_cce')->insert([
            'id'                  => $id,
            'fiscal_document_id'  => $data['fiscal_document_id'],
            'client_id'           => $data['client_id'],
            'sequencia'           => $data['sequencia'],
            'correcao'            => $data['correcao'],
            'protocolo'           => $data['protocolo'],
            'data_registro'       => $data['data_registro'],
            'xml_retorno'         => $data['xml_retorno'],
            'created_at'          => now(),
        ]);

        return $id;
    }
}
