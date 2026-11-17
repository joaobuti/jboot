<?php

namespace Domain\Fiscal\Repositories;

use Domain\Fiscal\Exceptions\CertificateNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FiscalCertificateRepository
{
    public function findByTenant(string $clientId, string $cnpjEmitente, string $ambiente): object
    {
        $cert = DB::table('fiscal_certificates')
            ->where('client_id', $clientId)
            ->where('cnpj_emitente', $cnpjEmitente)
            ->where('ambiente', $ambiente)
            ->first();

        if (! $cert) {
            throw new CertificateNotFoundException($cnpjEmitente, $ambiente);
        }

        return $cert;
    }

    public function markAsExpired(string $id): void
    {
        DB::table('fiscal_certificates')
            ->where('id', $id)
            ->update(['status' => 'expired', 'updated_at' => now()]);
    }

    public function markAlerted(string $id): void
    {
        DB::table('fiscal_certificates')
            ->where('id', $id)
            ->update(['alerted_at' => now(), 'updated_at' => now()]);
    }

    public function upsert(array $data): string
    {
        $existing = DB::table('fiscal_certificates')
            ->where('client_id', $data['client_id'])
            ->where('cnpj_emitente', $data['cnpj_emitente'])
            ->where('ambiente', $data['ambiente'])
            ->value('id');

        if ($existing) {
            DB::table('fiscal_certificates')
                ->where('id', $existing)
                ->update(array_merge($data, ['updated_at' => now()]));

            return $existing;
        }

        $id = (string) Str::uuid();
        DB::table('fiscal_certificates')->insert(array_merge($data, [
            'id'         => $id,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        return $id;
    }

    public function findExpiringUnalerted(int $daysAhead): \Illuminate\Support\Collection
    {
        return DB::table('fiscal_certificates')
            ->where('status', 'active')
            ->where('valid_until', '<=', now()->addDays($daysAhead))
            ->whereNull('alerted_at')
            ->get();
    }
}
