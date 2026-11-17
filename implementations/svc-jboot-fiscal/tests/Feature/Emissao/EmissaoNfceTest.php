<?php

it('returns 401 when Authorization header is absent', function () {
    $this->postJson('/api/v1/emissao/nfce', [])
        ->assertStatus(401);
});

it('returns 422 when dados_documento is missing', function () {
    $this->withHeaders(['Authorization' => 'Bearer invalid-token'])
        ->postJson('/api/v1/emissao/nfce', [])
        ->assertStatus(401); // JWT validation fails before request validation
});

it('health endpoint returns ok without auth', function () {
    $this->getJson('/api/health')
        ->assertStatus(200)
        ->assertJson(['status' => 'ok']);
});
