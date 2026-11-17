<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        DB::selectOne('SELECT 1');

        return response()->json(['status' => 'ok', 'timestamp' => now()->toISOString()]);
    }
}
