<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fiscal_tenant_config', function (Blueprint $table) {
            $table->text('razao_social')->nullable();
            $table->text('nome_fantasia')->nullable();
            $table->text('inscricao_estadual')->nullable();
            $table->text('telefone')->nullable();
            $table->text('email')->nullable();
            $table->text('address_logradouro')->nullable();
            $table->text('address_numero')->nullable();
            $table->text('address_complemento')->nullable();
            $table->text('address_bairro')->nullable();
            $table->text('address_municipio')->nullable();
            $table->char('address_uf', 2)->nullable();
            $table->char('address_cep', 8)->nullable();
            $table->char('address_codigo_municipio', 7)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fiscal_tenant_config', function (Blueprint $table) {
            $table->dropColumn([
                'razao_social', 'nome_fantasia', 'inscricao_estadual', 'telefone', 'email',
                'address_logradouro', 'address_numero', 'address_complemento', 'address_bairro',
                'address_municipio', 'address_uf', 'address_cep', 'address_codigo_municipio',
            ]);
        });
    }
};

