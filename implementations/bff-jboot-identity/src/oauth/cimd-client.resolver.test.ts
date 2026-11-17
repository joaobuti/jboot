import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CimdClientResolver, redirectMatches } from './cimd-client.resolver';

const CLIENT_ID = 'https://claude.ai/oauth/unit-client-metadata';

function resolverWith(document: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const resolver = new CimdClientResolver({
    oauthCimdAllowedHosts: ['claude.ai'],
    oauthAllowedRedirectUris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback', 'http://127.0.0.1/callback']
  } as never);
  resolver.useFetcher(async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    return new Response(typeof document === 'string' ? document : JSON.stringify(document), {
      status: init.status ?? 200,
      headers: init.headers
    });
  });
  return { resolver, calls };
}

void test('accepts a document from an allowlisted host and keeps only allowed redirects', async () => {
  const { resolver, calls } = resolverWith({
    client_id: CLIENT_ID,
    client_name: 'Claude',
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://attacker.example/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token']
  });
  const client = await resolver.resolve(CLIENT_ID);
  assert.deepEqual(client?.redirect_uris, ['https://claude.ai/api/mcp/auth_callback']);
  assert.equal(client?.client_name, 'Claude');
  assert.equal(client?.token_endpoint_auth_method, 'none');
  await resolver.resolve(CLIENT_ID);
  assert.equal(calls.length, 1, 'second resolution comes from cache');
});

void test('never fetches client ids outside the allowlist or not https', async () => {
  const { resolver, calls } = resolverWith({});
  for (const clientId of [
    'https://attacker.example/oauth/client',
    'http://claude.ai/oauth/client',
    'https://claude.ai/',
    'https://claude.ai:8443/oauth/client',
    'https://user:pass@claude.ai/oauth/client',
    'opaque-client-id'
  ]) {
    assert.equal(await resolver.resolve(clientId), undefined, clientId);
  }
  assert.equal(calls.length, 0);
});

void test('rejects documents that do not describe a public client for the same url', async () => {
  const cases: unknown[] = [
    { client_id: 'https://claude.ai/oauth/other', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] },
    { client_id: CLIENT_ID, redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'client_secret_post' },
    { client_id: CLIENT_ID, redirect_uris: ['https://attacker.example/callback'] },
    { client_id: CLIENT_ID, redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], grant_types: ['client_credentials'] },
    'not-json'
  ];
  for (const document of cases) {
    const { resolver } = resolverWith(document);
    assert.equal(await resolver.resolve(CLIENT_ID), undefined, JSON.stringify(document));
  }
});

void test('rejects oversized documents and failed responses', async () => {
  const big = resolverWith({ client_id: CLIENT_ID, redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], pad: 'x'.repeat(20_000) });
  assert.equal(await big.resolver.resolve(CLIENT_ID), undefined);
  const declared = resolverWith({ client_id: CLIENT_ID, redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, { headers: { 'content-length': '999999' } });
  assert.equal(await declared.resolver.resolve(CLIENT_ID), undefined);
  const missing = resolverWith({}, { status: 404 });
  assert.equal(await missing.resolver.resolve(CLIENT_ID), undefined);
});

void test('loopback redirects match any port but nothing else is relaxed', () => {
  assert.equal(redirectMatches('http://localhost:53123/callback', 'http://localhost/callback'), true);
  assert.equal(redirectMatches('http://127.0.0.1:4000/callback', 'http://127.0.0.1/callback'), true);
  assert.equal(redirectMatches('http://127.0.0.1:4000/callback', 'http://localhost/callback'), false);
  assert.equal(redirectMatches('http://localhost:4000/other', 'http://localhost/callback'), false);
  assert.equal(redirectMatches('https://claude.ai:444/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback'), false);
});

/**
 * Fixture real: corpo de GET https://claude.ai/oauth/claude-code-client-metadata
 * capturado em 2026-10-15 (HTTP 200, request-id req_011Cg4k2fEmqZkPywAA88yGH).
 * Documento publico do cliente Claude Code; nao contem dado pessoal.
 */
void test('accepts the real Claude Code client metadata document', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const realDocument = require('./fixtures/claude-code-cimd.fixture.json') as { client_id: string };
  const { resolver } = resolverWith(realDocument);
  const client = await resolver.resolve(realDocument.client_id);
  assert.equal(client?.client_name, 'Claude Code');
  assert.deepEqual(client?.redirect_uris, ['http://localhost/callback', 'http://127.0.0.1/callback']);
});
