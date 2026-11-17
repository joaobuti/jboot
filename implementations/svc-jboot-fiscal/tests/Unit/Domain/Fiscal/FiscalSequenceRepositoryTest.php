<?php

use Domain\Fiscal\Repositories\FiscalSequenceRepository;
use Illuminate\Support\Facades\DB;

it('throws when called outside a transaction', function () {
    $repo = new FiscalSequenceRepository();

    expect(fn () => $repo->nextNumber('client1', '22345678000199', 'nfce', 1, 'homologacao'))
        ->toThrow(RuntimeException::class, 'nextNumber() deve ser chamado dentro de DB::transaction()');
});

it('increments atomically inside a transaction', function () {
    DB::table('fiscal_document_sequences')->insert([
        'id'             => \Illuminate\Support\Str::uuid(),
        'client_id'      => 'test-client',
        'cnpj_emitente'  => '11222333000181',
        'tipo_documento' => 'nfce',
        'serie'          => 1,
        'ambiente'       => 'homologacao',
        'ultimo_numero'  => 0,
        'created_at'     => now(),
        'updated_at'     => now(),
    ]);

    $repo = new FiscalSequenceRepository();

    $first  = DB::transaction(fn () => $repo->nextNumber('test-client', '11222333000181', 'nfce', 1, 'homologacao'));
    $second = DB::transaction(fn () => $repo->nextNumber('test-client', '11222333000181', 'nfce', 1, 'homologacao'));

    expect($first)->toBe(1)
        ->and($second)->toBe(2);
})->skip('requires DB connection');
