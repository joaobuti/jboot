<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_document_sequences', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('client_id');
            $table->string('cnpj_emitente', 14);
            $table->string('tipo_documento', 16);
            $table->smallInteger('serie');
            $table->integer('ultimo_numero')->default(0);
            $table->string('ambiente', 16)->default('homologacao');
            $table->timestampsTz();

            $table->unique(['client_id', 'cnpj_emitente', 'tipo_documento', 'serie', 'ambiente']);
        });

        DB::statement("ALTER TABLE fiscal_document_sequences ADD CONSTRAINT chk_seq_tipo CHECK (tipo_documento IN ('nfce','nfe'))");
        DB::statement("ALTER TABLE fiscal_document_sequences ADD CONSTRAINT chk_seq_ambiente CHECK (ambiente IN ('homologacao','producao'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_document_sequences');
    }
};
