<?php

namespace App\Http\Middleware;

use Closure;
use Domain\Fiscal\Exceptions\TenantMismatchException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InjectClientContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $jwtClientId = $request->get('_jwt_client_id');

        if (! $jwtClientId) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $bodyClientId = $request->input('client_id');
        if ($bodyClientId && $bodyClientId !== $jwtClientId) {
            return response()->json(['error' => 'tenant_mismatch'], 403);
        }

        $request->merge(['_client_id' => $jwtClientId]);

        return $next($request);
    }
}
