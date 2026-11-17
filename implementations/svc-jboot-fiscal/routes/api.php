<?php

use App\Http\Controllers\CertificadoController;
use App\Http\Controllers\ConfigController;
use App\Http\Controllers\DocumentoController;
use App\Http\Controllers\EmissaoController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\NumeracaoController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware(['validate.service.jwt', 'inject.client.context'])->prefix('v1')->group(function () {
    Route::post('/certificados', [CertificadoController::class, 'store']);

    Route::post('/emissao/nfce', [EmissaoController::class, 'nfce']);
    Route::post('/emissao/nfe', [EmissaoController::class, 'nfe']);

    Route::get('/documentos', [DocumentoController::class, 'buscar']);
    Route::get('/documentos/{id}/status', [DocumentoController::class, 'status']);
    Route::post('/documentos/{id}/cancelamento', [DocumentoController::class, 'cancelamento']);
    Route::post('/documentos/{id}/cce', [DocumentoController::class, 'cce']);

    Route::post('/numeracao/inutilizacao', [NumeracaoController::class, 'inutilizar']);

    Route::get('/config', [ConfigController::class, 'show']);
    Route::put('/config', [ConfigController::class, 'upsert']);
});
