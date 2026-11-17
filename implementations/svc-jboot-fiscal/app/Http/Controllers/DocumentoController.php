<?php

namespace App\Http\Controllers;

use Domain\Fiscal\Repositories\FiscalDocumentRepository;
use Domain\Fiscal\Services\CancelamentoService;
use Domain\Fiscal\Services\CceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DocumentoController extends Controller
{
    public function __construct(
        private FiscalDocumentRepository $documentos,
        private CancelamentoService $cancelamentos,
        private CceService $cces,
    ) {}

    public function status(Request $request, string $id): JsonResponse
    {
        $clientId = $request->get('_client_id');
        $doc = $this->documentos->findById($clientId, $id);

        return response()->json($this->formatDoc($doc));
    }

    public function buscar(Request $request): JsonResponse
    {
        $request->validate([
            'chave_acesso' => 'required|string|size:44',
        ]);

        $clientId = $request->get('_client_id');
        $doc = $this->documentos->findByChaveAcesso($clientId, $request->input('chave_acesso'));

        return response()->json($this->formatDoc($doc));
    }

    private function formatDoc(object $doc): array
    {
        return [
            'fiscal_document_id' => $doc->id,
            'request_id'         => $doc->request_id,
            'tipo_documento'     => $doc->tipo_documento,
            'chave_acesso'       => $doc->chave_acesso,
            'protocolo'          => $doc->protocolo,
            'status'             => $doc->status,
            'data_emissao'       => $doc->data_emissao,
            'data_autorizacao'   => $doc->data_autorizacao,
            'danfe_pdf_base64'   => $doc->danfe_pdf ? base64_encode(stream_get_contents($doc->danfe_pdf)) : null,
        ];
    }

    public function cancelamento(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'justificativa' => 'required|string|min:15|max:255',
        ]);

        $clientId = $request->get('_client_id');
        $result = $this->cancelamentos->cancelar($clientId, $id, $request->input('justificativa'));

        return response()->json($result);
    }

    public function cce(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'correcao' => 'required|string|min:15|max:1000',
        ]);

        $clientId = $request->get('_client_id');
        $result = $this->cces->registrar($clientId, $id, $request->input('correcao'));

        return response()->json($result);
    }
}
