<?php

use Carbon\Carbon;
use Domain\Fiscal\Exceptions\CertificateExpiredException;
use Domain\Fiscal\Exceptions\CertificateNotFoundException;
use Domain\Fiscal\Repositories\FiscalCertificateRepository;
use Domain\Fiscal\Services\CertificateLoader;
use Infrastructure\Crypto\CertificateCrypto;

it('throws CertificateNotFoundException when certificate does not exist', function () {
    $repo = Mockery::mock(FiscalCertificateRepository::class);
    $repo->shouldReceive('findByTenant')
        ->andThrow(new CertificateNotFoundException('22345678000199', 'homologacao'));

    $crypto = Mockery::mock(CertificateCrypto::class);

    $loader = new CertificateLoader($repo, $crypto);

    expect(fn () => $loader->loadDecrypted('client-1', '22345678000199', 'homologacao'))
        ->toThrow(CertificateNotFoundException::class);
});

it('throws CertificateExpiredException when certificate is expired', function () {
    $expiredCert = (object) [
        'id'            => 'cert-id',
        'pfx_encrypted' => 'encrypted',
        'encryption_iv' => 'iv',
        'encryption_tag' => 'tag',
        'valid_until'   => Carbon::now()->subDay()->toIso8601String(),
    ];

    $repo = Mockery::mock(FiscalCertificateRepository::class);
    $repo->shouldReceive('findByTenant')->andReturn($expiredCert);
    $repo->shouldReceive('markAsExpired')->andReturn(null);

    $crypto = Mockery::mock(CertificateCrypto::class);

    $loader = new CertificateLoader($repo, $crypto);

    expect(fn () => $loader->loadDecrypted('client-1', '22345678000199', 'homologacao'))
        ->toThrow(CertificateExpiredException::class);
});

it('returns decrypted PFX when certificate is valid', function () {
    $validCert = (object) [
        'id'             => 'cert-id',
        'pfx_encrypted'  => 'encrypted-pfx',
        'encryption_iv'  => 'iv-bytes',
        'encryption_tag' => 'tag-bytes',
        'valid_until'    => Carbon::now()->addDays(30)->toIso8601String(),
        'status'         => 'active',
    ];

    $repo = Mockery::mock(FiscalCertificateRepository::class);
    $repo->shouldReceive('findByTenant')->andReturn($validCert);

    $crypto = Mockery::mock(CertificateCrypto::class);
    $crypto->shouldReceive('decrypt')
        ->with('encrypted-pfx', 'iv-bytes', 'tag-bytes')
        ->andReturn('raw-pfx-binary');

    $loader = new CertificateLoader($repo, $crypto);

    expect($loader->loadDecrypted('client-1', '22345678000199', 'homologacao'))
        ->toBe('raw-pfx-binary');
});

afterEach(fn () => Mockery::close());
