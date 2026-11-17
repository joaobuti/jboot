<?php

use Carbon\Carbon;
use Domain\Fiscal\Exceptions\DocumentoNaoEncontradoException;
use Domain\Fiscal\Services\CancelamentoService;
use Domain\Fiscal\Repositories\FiscalDocumentRepository;
use Domain\Fiscal\Repositories\FiscalCancellationRepository;
use Domain\Fiscal\Services\CertificateLoader;
use Infrastructure\Sefaz\SefazGateway;
use Domain\Fiscal\Listeners\RegistrarEventoAuditoria;

function makeCancelamentoService(object $doc): CancelamentoService
{
    $docs = Mockery::mock(FiscalDocumentRepository::class);
    $docs->shouldReceive('findById')->andReturn($doc);
    $docs->shouldReceive('updateStatus')->andReturn(null);

    $cancels = Mockery::mock(FiscalCancellationRepository::class);
    $cancels->shouldReceive('create')->andReturn('uuid-cancel');

    $loader = Mockery::mock(CertificateLoader::class);
    $loader->shouldReceive('loadDecrypted')->andReturn('pfx-binary');

    $sefaz = Mockery::mock(SefazGateway::class);
    $sefaz->shouldReceive('cancelar')->andReturn([
        'protocolo'    => '123456',
        'data_evento'  => now()->toIso8601String(),
        'xml_retorno'  => '<xml/>',
        'sefaz_codigo' => '135',
        'sefaz_motivo' => 'Evento registrado',
    ]);

    $auditoria = Mockery::mock(RegistrarEventoAuditoria::class);
    $auditoria->shouldReceive('handle')->andReturn(null);

    return new CancelamentoService($docs, $cancels, $loader, $sefaz, $auditoria);
}

it('cancels NFC-e within 24h window', function () {
    $doc = (object) [
        'id'             => 'doc-id',
        'client_id'      => 'client-1',
        'cnpj_emitente'  => '22345678000199',
        'ambiente'       => 'homologacao',
        'tipo_documento' => 'nfce',
        'status'         => 'authorized',
        'chave_acesso'   => '35241222345678000199650010000000011234567890',
        'protocolo'      => '135000000001',
        'data_autorizacao' => Carbon::now()->subHours(23)->toIso8601String(),
        'serie'          => 1,
    ];

    $service = makeCancelamentoService($doc);
    $result  = $service->cancelar('client-1', 'doc-id', 'Cancelamento por erro no item');

    expect($result['status'])->toBe('cancelled');
});

it('rejects cancellation after 24h for NFC-e', function () {
    $doc = (object) [
        'id'             => 'doc-id',
        'client_id'      => 'client-1',
        'cnpj_emitente'  => '22345678000199',
        'ambiente'       => 'homologacao',
        'tipo_documento' => 'nfce',
        'status'         => 'authorized',
        'chave_acesso'   => '35241222345678000199650010000000011234567890',
        'protocolo'      => '135000000001',
        'data_autorizacao' => Carbon::now()->subHours(25)->toIso8601String(),
        'serie'          => 1,
    ];

    $service = makeCancelamentoService($doc);

    expect(fn () => $service->cancelar('client-1', 'doc-id', 'Cancelamento tardio'))
        ->toThrow(InvalidArgumentException::class, 'Prazo de cancelamento expirado');
});

it('rejects cancellation of non-authorized document', function () {
    $doc = (object) [
        'id'             => 'doc-id',
        'client_id'      => 'client-1',
        'cnpj_emitente'  => '22345678000199',
        'ambiente'       => 'homologacao',
        'tipo_documento' => 'nfe',
        'status'         => 'pending',
        'data_autorizacao' => null,
        'serie'          => 1,
    ];

    $service = makeCancelamentoService($doc);

    expect(fn () => $service->cancelar('client-1', 'doc-id', 'Cancelamento indevido'))
        ->toThrow(InvalidArgumentException::class, "nao pode ser cancelado");
});

afterEach(fn () => Mockery::close());
