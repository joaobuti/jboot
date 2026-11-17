<?php

return [
    'cert_encryption_key' => env('FISCAL_CERT_ENCRYPTION_KEY'),
    'cert_alert_days_before' => (int) env('CERT_ALERT_DAYS_BEFORE', 30),

    'identity_jwks_url' => env('IDENTITY_HUB_JWKS_URL'),
    'service_audience' => env('FISCAL_SERVICE_AUDIENCE', 'svc:fiscal'),
    'internal_secret' => env('FISCAL_INTERNAL_SECRET'),

    'sefaz' => [
        'ambiente_padrao' => env('SEFAZ_AMBIENTE_PADRAO', 'homologacao'),
        'timeout_ms' => (int) env('SEFAZ_TIMEOUT_MS', 30000),
        'timeout_per_attempt_ms' => (int) env('SEFAZ_TIMEOUT_PER_ATTEMPT_MS', 10000),
        'retry_max' => (int) env('SEFAZ_RETRY_MAX', 3),
        'retry_backoff_base_ms' => (int) env('SEFAZ_RETRY_BACKOFF_BASE_MS', 1000),
    ],
];
