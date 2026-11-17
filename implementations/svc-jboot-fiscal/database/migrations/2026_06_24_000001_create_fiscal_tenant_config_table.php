<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_tenant_config', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('client_id');
            $table->string('cnpj_emitente', 14);
            $table->string('ambiente', 16)->default('homologacao');
            $table->smallInteger('serie_nfce')->default(1);
            $table->smallInteger('serie_nfe')->default(1);
            $table->text('csc')->nullable();
            $table->text('csc_id')->nullable();
            $table->string('regime_fiscal', 32)->default('simples');
            $table->text('cfop_padrao_nfce')->nullable();
            $table->text('cfop_padrao_nfe')->nullable();
            $table->smallInteger('icms_origem_padrao')->nullable();
            $table->text('icms_cst_padrao')->nullable();
            $table->decimal('icms_aliquota_padrao', 7, 4)->nullable();
            $table->text('pis_cst_padrao')->nullable();
            $table->decimal('pis_aliquota_padrao', 7, 4)->nullable();
            $table->text('cofins_cst_padrao')->nullable();
            $table->decimal('cofins_aliquota_padrao', 7, 4)->nullable();
            $table->timestampsTz();

            $table->unique(['client_id', 'cnpj_emitente']);
            $table->index(['client_id']);
        });

        // Dev tenant data is seeded from docker/postgres/init/024_fiscal.sql,
        // where the canonical Identity client UUID is available.
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_tenant_config');
    }
};
