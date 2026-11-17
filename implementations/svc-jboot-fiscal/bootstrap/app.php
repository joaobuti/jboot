<?php

use App\Http\Middleware\InjectClientContext;
use App\Http\Middleware\ValidateServiceJwt;
use Domain\Fiscal\Exceptions\CertificateExpiredException;
use Domain\Fiscal\Exceptions\CfopRequiredException;
use Domain\Fiscal\Exceptions\DocumentoNaoEncontradoException;
use Domain\Fiscal\Exceptions\FiscalConfigNotFoundException;
use Domain\Fiscal\Exceptions\SefazRejeicaoException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'validate.service.jwt' => ValidateServiceJwt::class,
            'inject.client.context' => InjectClientContext::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (CertificateExpiredException $e, Request $request) {
            return response()->json([
                'error' => 'certificate_expired',
                'cnpj_emitente' => $e->cnpjEmitente,
                'valid_until' => $e->validUntil,
            ], 409);
        });

        $exceptions->render(function (SefazRejeicaoException $e, Request $request) {
            return response()->json([
                'error' => 'fiscal_rejection',
                'sefaz_codigo' => $e->sefazCodigo,
                'sefaz_motivo' => $e->sefazMotivo,
            ], 422);
        });

        $exceptions->render(function (DocumentoNaoEncontradoException $e, Request $request) {
            return response()->json(['error' => 'document_not_found'], 404);
        });

        $exceptions->render(function (FiscalConfigNotFoundException $e, Request $request) {
            return response()->json([
                'error'         => 'fiscal_config_not_found',
                'cnpj_emitente' => $e->cnpjEmitente,
            ], 422);
        });

        $exceptions->render(function (CfopRequiredException $e, Request $request) {
            return response()->json([
                'error'    => 'cfop_required',
                'item_seq' => $e->itemSeq,
                'message'  => 'Item sem CFOP e configuração fiscal sem CFOP padrão.',
            ], 422);
        });
    })->create();
