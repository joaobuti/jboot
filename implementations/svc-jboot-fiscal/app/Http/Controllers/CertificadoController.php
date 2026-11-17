<?php

namespace App\Http\Controllers;

use Domain\Fiscal\Services\CertificadoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CertificadoController extends Controller
{
    public function __construct(private CertificadoService $service) {}

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'cnpj_emitente' => 'required|string|size:14',
            'ambiente'      => 'required|in:homologacao,producao',
            'pfx_base64'    => 'required|string',
            'pfx_password'  => 'required|string',
        ]);

        $pfxBinary = base64_decode($request->input('pfx_base64'), strict: true);

        if ($pfxBinary === false) {
            return response()->json(['message' => 'pfx_base64 invalido'], 422);
        }

        $result = $this->service->armazenar(
            clientId:     $request->get('_client_id'),
            cnpjEmitente: $request->input('cnpj_emitente'),
            ambiente:     $request->input('ambiente'),
            pfxBinary:    $pfxBinary,
            pfxPassword:  $request->input('pfx_password'),
        );

        return response()->json($result, 201);
    }
}
