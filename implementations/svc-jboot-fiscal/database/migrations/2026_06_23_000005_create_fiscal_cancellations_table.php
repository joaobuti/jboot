<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_cancellations', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('fiscal_document_id')->constrained('fiscal_documents');
            $table->uuid('client_id');
            $table->string('tipo', 16);
            $table->smallInteger('numero_sequencial')->nullable();
            $table->text('justificativa');
            $table->text('xml_evento');
            $table->text('xml_retorno_evento')->nullable();
            $table->string('protocolo_evento', 64)->nullable();
            $table->string('status', 32)->default('pending');
            $table->ipAddress('ip_origem')->nullable();
            $table->string('caller_service', 128)->nullable();
            $table->timestampsTz();

            $table->index(['fiscal_document_id']);
        });

        DB::statement("ALTER TABLE fiscal_cancellations ADD CONSTRAINT chk_cancel_tipo CHECK (tipo IN ('cancelamento','cce'))");
        DB::statement("ALTER TABLE fiscal_cancellations ADD CONSTRAINT chk_cancel_status CHECK (status IN ('pending','authorized','rejected'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_cancellations');
    }
};
