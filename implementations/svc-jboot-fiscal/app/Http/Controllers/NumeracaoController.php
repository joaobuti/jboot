<?php

namespace App\Http\Controllers;

use Domain\Fiscal\Services\InutilizacaoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NumeracaoController extends Controller
{
    public function __construct(private InutilizacaoService $inutilizacao) {}

    public function inutilizar(Request $request): JsonResponse
    {
        $request->validate([
            'cnpj_emitente'  => 'required|string|size:14',
            'tipo_documento' => 'required|in:nfe,nfce',
            'serie'          => 'required|integer|min:1',
            'numero_inicial' => 'required|integer|min:1',
            'numero_final'   => 'required|integer|min:1',
            'justificativa'  => 'required|string|min:15|max:255',
            'ambiente'       => 'required|in:homologacao,producao',
        ]);

        $clientId = $request->get('_client_id');

        $result = $this->inutilizacao->inutilizar(
            clientId:      $clientId,
            cnpjEmitente:  $request->input('cnpj_emitente'),
            tipoDocumento: $request->input('tipo_documento'),
            serie:         (int) $request->input('serie'),
            numeroIni:     (int) $request->input('numero_inicial'),
            numeroFim:     (int) $request->input('numero_final'),
            justificativa: $request->input('justificativa'),
            ambiente:      $request->input('ambiente'),
        );

        return response()->json($result);
    }
}
