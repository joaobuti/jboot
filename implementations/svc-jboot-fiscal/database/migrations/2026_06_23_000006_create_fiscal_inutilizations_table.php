<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_inutilizations', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('client_id');
            $table->string('cnpj_emitente', 14);
            $table->string('tipo_documento', 16);
            $table->smallInteger('serie');
            $table->integer('numero_ini');
            $table->integer('numero_fim');
            $table->string('ambiente', 16)->default('homologacao');
            $table->text('justificativa');
            $table->text('xml_envio');
            $table->text('xml_retorno')->nullable();
            $table->string('protocolo', 64)->nullable();
            $table->string('status', 32)->default('pending');
            $table->ipAddress('ip_origem')->nullable();
            $table->string('caller_service', 128)->nullable();
            $table->timestampsTz();

            $table->unique(['client_id', 'cnpj_emitente', 'tipo_documento', 'serie', 'numero_ini', 'numero_fim', 'ambiente']);
        });

        DB::statement("ALTER TABLE fiscal_inutilizations ADD CONSTRAINT chk_inut_tipo CHECK (tipo_documento IN ('nfce','nfe'))");
        DB::statement("ALTER TABLE fiscal_inutilizations ADD CONSTRAINT chk_inut_ambiente CHECK (ambiente IN ('homologacao','producao'))");
        DB::statement("ALTER TABLE fiscal_inutilizations ADD CONSTRAINT chk_inut_status CHECK (status IN ('pending','authorized','rejected'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_inutilizations');
    }
};
