<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_documents', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('client_id');
            $table->uuid('request_id')->unique();
            $table->string('cnpj_emitente', 14);
            $table->string('tipo_documento', 16);
            $table->smallInteger('serie');
            $table->integer('numero');
            $table->string('chave_acesso', 44)->unique()->nullable();
            $table->string('ambiente', 16)->default('homologacao');
            $table->string('status', 32)->default('pending');
            $table->string('protocolo', 64)->nullable();
            $table->timestampTz('data_emissao');
            $table->timestampTz('data_autorizacao')->nullable();
            $table->timestampTz('data_cancelamento')->nullable();
            $table->string('motivo_cancelamento', 255)->nullable();
            $table->string('contingencia_tipo', 32)->nullable();
            $table->timestampTz('contingencia_data')->nullable();
            $table->smallInteger('retry_count')->default(0);
            $table->text('xml_envio');
            $table->text('xml_retorno')->nullable();
            $table->binary('danfe_pdf')->nullable();
            $table->text('qrcode_url')->nullable();
            $table->ipAddress('ip_origem')->nullable();
            $table->string('caller_service', 128)->nullable();
            $table->timestampsTz();

            $table->unique(['client_id', 'cnpj_emitente', 'tipo_documento', 'serie', 'numero', 'ambiente']);
            $table->index(['client_id', 'status']);
        });

        DB::statement("ALTER TABLE fiscal_documents ADD CONSTRAINT chk_doc_tipo CHECK (tipo_documento IN ('nfce','nfe'))");
        DB::statement("ALTER TABLE fiscal_documents ADD CONSTRAINT chk_doc_ambiente CHECK (ambiente IN ('homologacao','producao'))");
        DB::statement("ALTER TABLE fiscal_documents ADD CONSTRAINT chk_doc_status CHECK (status IN ('pending','processing','authorized','rejected','cancelled','inutilized','contingency','denegada'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_documents');
    }
};
