<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\JWT;
use Firebase\JWT\JWK;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class ValidateServiceJwt
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        try {
            $decoded = $this->decodeToken($token);

            $audience = config('fiscal.service_audience');
            $aud = is_array($decoded->aud) ? $decoded->aud : [$decoded->aud];
            if (! in_array($audience, $aud)) {
                return response()->json(['error' => 'unauthorized'], 401);
            }

            $request->merge(['_jwt_client_id' => $decoded->sub ?? null]);
            $request->merge(['_jwt_service' => $decoded->service ?? null]);
        } catch (\Throwable) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        return $next($request);
    }

    private function decodeToken(string $token): object
    {
        // Try HS256 with shared internal secret first (BFF → fiscal s2s calls).
        // env() is used directly here (instead of config()) because config:cache runs at build
        // time and this secret is only available at runtime via Docker env injection.
        $internalSecret = env('FISCAL_INTERNAL_SECRET');
        if ($internalSecret) {
            try {
                return JWT::decode($token, new Key($internalSecret, 'HS256'));
            } catch (\Throwable) {
                // not an internal token, fall through to JWKS
            }
        }

        // Fall back to asymmetric JWKS validation (external / identity tokens)
        $keys = JWK::parseKeySet($this->getJwks());
        return JWT::decode($token, $keys);
    }

    private function getJwks(): array
    {
        return Cache::remember('fiscal_jwks', 300, function () {
            $url = config('fiscal.identity_jwks_url');
            $response = Http::timeout(5)->get($url);

            if (! $response->ok()) {
                throw new \RuntimeException('Failed to fetch JWKS');
            }

            return $response->json();
        });
    }
}
