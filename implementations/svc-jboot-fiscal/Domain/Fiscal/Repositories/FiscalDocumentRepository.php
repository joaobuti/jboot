<?php

namespace Domain\Fiscal\Repositories;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FiscalDocumentRepository
{
    public function findByRequestId(string $clientId, string $requestId): ?object
    {
        return DB::table('fiscal_documents')
            ->where('client_id', $clientId)
            ->where('request_id', $requestId)
            ->first();
    }

    public function findById(string $clientId, string $id): object
    {
        $doc = DB::table('fiscal_documents')
            ->where('client_id', $clientId)
            ->where('id', $id)
            ->first();

        if (! $doc) {
            throw new \Domain\Fiscal\Exceptions\DocumentoNaoEncontradoException($id);
        }

        return $doc;
    }

    public function createPending(array $data): string
    {
        $id = (string) Str::uuid();

        DB::table('fiscal_documents')->insert([
            'id'              => $id,
            'request_id'      => $data['request_id'],
            'client_id'       => $data['client_id'],
            'cnpj_emitente'   => $data['cnpj_emitente'],
            'tipo_documento'  => $data['tipo_documento'],
            'serie'           => $data['serie'],
            'numero'          => $data['numero'],
            'uf_emitente'     => $data['uf_emitente'],
            'ambiente'        => $data['ambiente'],
            'status'          => 'pending',
            'data_emissao'    => $data['data_emissao'],
            'xml_envio'       => $data['xml_envio'],
            'ip_origem'       => $data['ip_origem'],
            'caller_service'  => $data['caller_service'],
            'retry_count'     => 0,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        return $id;
    }

    public function updateStatus(string $id, string $status, array $fields = []): void
    {
        DB::table('fiscal_documents')
            ->where('id', $id)
            ->update(array_merge(['status' => $status, 'updated_at' => now()], $fields));
    }

    public function findByChaveAcesso(string $clientId, string $chaveAcesso): object
    {
        $doc = DB::table('fiscal_documents')
            ->where('client_id', $clientId)
            ->where('chave_acesso', $chaveAcesso)
            ->first();

        if (! $doc) {
            throw new \Domain\Fiscal\Exceptions\DocumentoNaoEncontradoException($chaveAcesso);
        }

        return $doc;
    }

    public function findPendingContingency(): \Illuminate\Support\Collection
    {
        return DB::table('fiscal_documents')
            ->where('status', 'contingency')
            ->where('retry_count', '<', 3)
            ->orderBy('created_at')
            ->get();
    }

    public function incrementRetry(string $id): void
    {
        DB::table('fiscal_documents')
            ->where('id', $id)
            ->increment('retry_count', 1, ['updated_at' => now()]);
    }
}
