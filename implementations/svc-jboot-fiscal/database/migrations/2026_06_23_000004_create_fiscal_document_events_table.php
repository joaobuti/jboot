<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_document_events', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('fiscal_document_id')->constrained('fiscal_documents');
            $table->uuid('client_id');
            $table->string('event_type', 64);
            $table->string('status_anterior', 32)->nullable();
            $table->string('status_novo', 32);
            $table->string('sefaz_codigo', 16)->nullable();
            $table->text('sefaz_motivo')->nullable();
            $table->jsonb('payload_resumo')->nullable();
            $table->ipAddress('ip_origem')->nullable();
            $table->string('caller_service', 128)->nullable();
            $table->timestampTz('created_at')->default(DB::raw('now()'));

            $table->index(['fiscal_document_id']);
            $table->index(['client_id', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_document_events');
    }
};
