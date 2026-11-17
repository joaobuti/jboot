<?php

namespace App\Providers;

use Infrastructure\Crypto\CertificateCrypto;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(CertificateCrypto::class, function () {
            return new CertificateCrypto(config('fiscal.cert_encryption_key'));
        });
    }

    public function boot(): void {}
}
