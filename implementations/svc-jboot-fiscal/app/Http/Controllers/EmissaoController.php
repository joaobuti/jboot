<?php

namespace App\Http\Controllers;

use App\Http\Requests\EmissaoNfceRequest;
use App\Http\Requests\EmissaoNfeRequest;
use Domain\Fiscal\DTOs\EmissaoNfceDto;
use Domain\Fiscal\DTOs\EmissaoNfeDto;
use Domain\Fiscal\Services\EmissaoService;
use Illuminate\Http\JsonResponse;

class EmissaoController extends Controller
{
    public function __construct(private EmissaoService $service) {}

    public function nfce(EmissaoNfceRequest $request): JsonResponse
    {
        $this->assertIdempotencyKey($request);
        $dto = EmissaoNfceDto::fromArray(array_merge(
            $request->validated(),
            ['client_id' => $request->get('_client_id')]
        ));

        $result = $this->service->emitirNfce($dto);

        $status = match ($result['status']) {
            'authorized' => 201,
            'contingency' => 202,
            default => 422,
        };

        return response()->json($result, $status);
    }

    public function nfe(EmissaoNfeRequest $request): JsonResponse
    {
        $this->assertIdempotencyKey($request);
        $dto = EmissaoNfeDto::fromArray(array_merge(
            $request->validated(),
            ['client_id' => $request->get('_client_id')]
        ));

        $result = $this->service->emitirNfe($dto);

        $status = match ($result['status']) {
            'authorized' => 201,
            'contingency' => 202,
            default => 422,
        };

        return response()->json($result, $status);
    }

    private function assertIdempotencyKey(EmissaoNfceRequest|EmissaoNfeRequest $request): void
    {
        $header = $request->header('Idempotency-Key');
        $requestId = (string) $request->validated('request_id');
        abort_unless(is_string($header) && hash_equals($requestId, $header), 422, 'Idempotency-Key deve coincidir com request_id');
    }
}
