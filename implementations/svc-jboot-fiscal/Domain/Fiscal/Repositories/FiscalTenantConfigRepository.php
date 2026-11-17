<?php

namespace Domain\Fiscal\Repositories;

use Illuminate\Support\Facades\DB;

class FiscalTenantConfigRepository
{
    public function findAllByClient(string $clientId): array
    {
        return DB::table('fiscal_tenant_config')
            ->where('client_id', $clientId)
            ->orderBy('created_at')
            ->get()
            ->all();
    }

    public function findByClientAndCnpj(string $clientId, string $cnpj): ?object
    {
        return DB::table('fiscal_tenant_config')
            ->where('client_id', $clientId)
            ->where('cnpj_emitente', $cnpj)
            ->first();
    }

    public function upsert(string $clientId, array $data): object
    {
        $existing = $this->findByClientAndCnpj($clientId, $data['cnpj_emitente']);
        $ambiente = $data['ambiente'] ?? ($existing?->ambiente ?? 'homologacao');

        if ($existing) {
            if (isset($data['serie_nfce']) && (int) $data['serie_nfce'] !== (int) $existing->serie_nfce) {
                $this->ensureSequence($clientId, $data['cnpj_emitente'], 'nfce', (int) $data['serie_nfce'], $ambiente);
            }
            if (isset($data['serie_nfe']) && (int) $data['serie_nfe'] !== (int) $existing->serie_nfe) {
                $this->ensureSequence($clientId, $data['cnpj_emitente'], 'nfe', (int) $data['serie_nfe'], $ambiente);
            }

            DB::table('fiscal_tenant_config')
                ->where('client_id', $clientId)
                ->where('cnpj_emitente', $data['cnpj_emitente'])
                ->update(array_merge($data, ['updated_at' => now()]));
        } else {
            DB::table('fiscal_tenant_config')->insert(array_merge([
                'client_id'  => $clientId,
                'created_at' => now(),
                'updated_at' => now(),
            ], $data));

            $this->ensureSequence($clientId, $data['cnpj_emitente'], 'nfce', (int) ($data['serie_nfce'] ?? 1), $ambiente);
            $this->ensureSequence($clientId, $data['cnpj_emitente'], 'nfe', (int) ($data['serie_nfe'] ?? 1), $ambiente);
        }

        return $this->findByClientAndCnpj($clientId, $data['cnpj_emitente']);
    }

    private function ensureSequence(string $clientId, string $cnpj, string $tipo, int $serie, string $ambiente): void
    {
        DB::table('fiscal_document_sequences')->insertOrIgnore([
            'client_id'      => $clientId,
            'cnpj_emitente'  => $cnpj,
            'tipo_documento' => $tipo,
            'serie'          => $serie,
            'ultimo_numero'  => 0,
            'ambiente'       => $ambiente,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
    }
}
