<?php

namespace Domain\Fiscal\Listeners;

use Illuminate\Support\Facades\DB;

class RegistrarEventoAuditoria
{
    public function handle(object $event): void
    {
        DB::table('fiscal_document_events')->insert([
            'id' => DB::selectOne('SELECT gen_random_uuid() AS id')->id,
            'fiscal_document_id' => $event->documentoId,
            'client_id' => $event->clientId,
            'event_type' => $event->eventType,
            'status_anterior' => $event->statusAnterior ?? null,
            'status_novo' => $event->statusNovo,
            'sefaz_codigo' => $event->sefazCodigo ?? null,
            'sefaz_motivo' => $event->sefazMotivo ?? null,
            'payload_resumo' => isset($event->payloadResumo) ? json_encode($event->payloadResumo) : null,
            'ip_origem' => $event->ipOrigem ?? null,
            'caller_service' => $event->callerService ?? null,
            'created_at' => now(),
        ]);
    }
}
