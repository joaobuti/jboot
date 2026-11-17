<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_certificates', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('client_id');
            $table->string('cnpj_emitente', 14);
            $table->binary('pfx_encrypted');
            $table->binary('encryption_iv');
            $table->binary('encryption_tag');
            $table->string('password_hint')->nullable();
            $table->timestampTz('valid_from');
            $table->timestampTz('valid_until');
            $table->string('serial_number', 128);
            $table->string('subject_cn', 512);
            $table->string('ambiente', 16)->default('homologacao');
            $table->string('status', 32)->default('active');
            $table->timestampTz('alerted_at')->nullable();
            $table->timestampsTz();

            $table->unique(['client_id', 'cnpj_emitente', 'ambiente']);
        });

        DB::statement("ALTER TABLE fiscal_certificates ADD CONSTRAINT chk_cert_ambiente CHECK (ambiente IN ('homologacao','producao'))");
        DB::statement("ALTER TABLE fiscal_certificates ADD CONSTRAINT chk_cert_status CHECK (status IN ('active','expired','revoked'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_certificates');
    }
};
