import { strict as assert } from 'node:assert';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
// Sem esModuleInterop no projeto: o default do express so existe via require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import express = require('express');
import { Server } from 'node:http';
import { AuditService } from '../audit/audit.service';
import { AuthRepository } from '../auth/auth.repository';
import { IdentityApplicationsCacheService } from '../auth/identity-applications-cache.service';
import { IdentityJwtService } from '../auth/jwt.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { CimdClientResolver } from './cimd-client.resolver';
import { OAuthConnectionsService } from './oauth-connections.service';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthRepository } from './oauth.repository';
import { buildOAuthRouter } from './oauth.router';

/**
 * Fluxo OAuth completo contra PostgreSQL/Valkey reais do container, pelos
 * handlers HTTP do SDK. Opt-in: JBOOT_OAUTH_IT=1 (requer migration 077 e os
 * seeds de dev: Operador Senior no Flow do cliente JBoot e Usuario Teste no
 * Flow do cliente Demo JBoot, tenants distintos).
 */
const enabled = process.env.JBOOT_OAUTH_IT === '1';
const CLIENT_ID = 'https://claude.ai/oauth/it-client-metadata';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const RESOURCE = 'http://localhost:8010/kanban/mcp';

const config = new AppConfigService();
let db: DatabaseService;
let jwt: IdentityJwtService;
let connections: OAuthConnectionsService;
let server: Server;
let cache: RedisCacheService;
let baseUrl = '';
let operatorToken = '';
let otherUserToken = '';
let serviceToken = '';

before(async () => {
  if (!enabled) return;
  db = new DatabaseService(config);
  jwt = new IdentityJwtService(config);
  cache = new RedisCacheService(config);
  const identityApplications = new IdentityApplicationsCacheService(cache, config, new AuthRepository(db));
  const resolver = new CimdClientResolver(config);
  resolver.useFetcher(async () => new Response(JSON.stringify({
    client_id: CLIENT_ID,
    client_name: 'Claude (teste)',
    redirect_uris: [REDIRECT, 'http://localhost/callback'],
    token_endpoint_auth_method: 'none'
  })));
  const repository = new OAuthRepository(db);
  const audit = new AuditService(db);
  const provider = new OAuthProviderService(config, repository, resolver, identityApplications, audit);
  connections = new OAuthConnectionsService(config, jwt, repository, provider, audit);

  const app = express();
  app.use(buildOAuthRouter(provider, config));
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(config, {
    oauthIssuerUrl: baseUrl,
    oauthConsentUrl: 'http://consent.test/oauth/consentimento',
    flowConnectorResourceUrl: RESOURCE
  });

  operatorToken = await flowTokenFor('00000000191', identityApplications);
  otherUserToken = await flowTokenFor('00011122233', identityApplications);
  serviceToken = await jwt.issueServiceAccessToken(config.platformServiceClientId, 'svc:identity-oauth');
});

after(async () => {
  if (!enabled) return;
  const grants = 'SELECT id FROM oauth_grants WHERE oauth_client_id = $1';
  await db.query(`DELETE FROM oauth_tokens WHERE grant_id IN (${grants})`, [CLIENT_ID]);
  await db.query(`DELETE FROM oauth_authorization_codes WHERE grant_id IN (${grants})`, [CLIENT_ID]);
  await db.query('DELETE FROM oauth_grants WHERE oauth_client_id = $1', [CLIENT_ID]);
  await db.query("DELETE FROM oauth_authorization_requests WHERE oauth_client_id = $1", [CLIENT_ID]);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  (cache as unknown as { socket: { destroy(): void } | null }).socket?.destroy();
  await db.onModuleDestroy();
});

async function flowTokenFor(document: string, identityApplications: IdentityApplicationsCacheService): Promise<string> {
  const identity = await db.query<{ id: string }>('SELECT id FROM identities WHERE document_number = $1', [document]);
  const identityId = identity.rows[0].id;
  const destination = (await identityApplications.listDestinations(identityId))
    .find((candidate) => candidate.applicationSlug === 'flow');
  assert.ok(destination, `seed sem Flow para ${document}`);
  return jwt.issueAccessToken({ sessionId: randomUUID(), jwtId: randomUUID(), identityId, destination });
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function authorize(challenge: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-it',
    resource: RESOURCE,
    ...extra
  });
  return fetch(`${baseUrl}/oauth/authorize?${params}`, { redirect: 'manual' });
}

async function token(body: Record<string, string>) {
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body })
  });
  return { status: response.status, body: await response.json() as Record<string, string> };
}

/** authorize -> consentimento -> codigo. */
async function obtainCode(verifierPair = pkce()) {
  const response = await authorize(verifierPair.challenge);
  assert.equal(response.status, 302);
  const consent = new URL(response.headers.get('location') ?? '');
  assert.equal(consent.origin + consent.pathname, 'http://consent.test/oauth/consentimento');
  const requestId = consent.searchParams.get('request') ?? '';
  const decision = await connections.decide(operatorToken, requestId, true);
  const redirect = new URL(decision.redirectUrl);
  assert.equal(redirect.origin + redirect.pathname, REDIRECT);
  assert.equal(redirect.searchParams.get('state'), 'state-it');
  assert.equal(redirect.searchParams.get('iss'), baseUrl);
  return { code: redirect.searchParams.get('code') ?? '', requestId, verifier: verifierPair.verifier };
}

async function exchange(code: string, verifier: string) {
  const result = await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, resource: RESOURCE });
  const introspection = result.status === 200 ? await connections.introspect(serviceToken, result.body.access_token) : null;
  return { ...result, introspection };
}

void test('metadata advertises CIMD, public clients and S256 only', { skip: !enabled }, async () => {
  const metadata = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>;
  assert.equal(metadata.client_id_metadata_document_supported, true);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none']);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.equal(metadata.registration_endpoint, undefined, 'DCR desligado');
});

void test('full flow: consent, code exchange, introspection, refresh rotation and reuse revocation', { skip: !enabled }, async () => {
  const { code, requestId, verifier } = await obtainCode();
  await assert.rejects(() => connections.decide(operatorToken, requestId, true), /Gone/i, 'consentimento e de uso unico');

  const first = await exchange(code, verifier);
  assert.equal(first.status, 200);
  assert.equal(first.body.token_type, 'Bearer');
  assert.equal(first.body.scope, 'flow:connector:read flow:connector:comment');
  assert.equal(first.introspection?.active, true);
  assert.equal(first.introspection?.aud, RESOURCE);
  assert.ok(first.introspection?.database_ref);
  assert.ok(first.introspection?.flow_scopes?.includes('flow:read'));

  const refreshed = await token({ grant_type: 'refresh_token', refresh_token: first.body.refresh_token });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.refresh_token, first.body.refresh_token);

  const reuse = await token({ grant_type: 'refresh_token', refresh_token: first.body.refresh_token });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.error, 'invalid_grant');
  // Reuso revoga a conexao inteira, inclusive o par recem-emitido.
  assert.equal((await connections.introspect(serviceToken, refreshed.body.access_token)).active, false);
  const afterReuse = await token({ grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token });
  assert.equal(afterReuse.body.error, 'invalid_grant');
});

void test('authorization code is single use and reuse revokes its tokens', { skip: !enabled }, async () => {
  const { code, verifier } = await obtainCode();
  const first = await exchange(code, verifier);
  assert.equal(first.status, 200);
  const replay = await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT });
  assert.equal(replay.body.error, 'invalid_grant');
  assert.equal((await connections.introspect(serviceToken, first.body.access_token)).active, false);
});

void test('wrong PKCE verifier, redirect or resource never yield tokens', { skip: !enabled }, async () => {
  const wrongVerifier = await obtainCode();
  const badPkce = await token({ grant_type: 'authorization_code', code: wrongVerifier.code, code_verifier: pkce().verifier, redirect_uri: REDIRECT });
  assert.equal(badPkce.body.error, 'invalid_grant');

  const wrongRedirect = await obtainCode();
  const badRedirect = await token({
    grant_type: 'authorization_code', code: wrongRedirect.code, code_verifier: wrongRedirect.verifier, redirect_uri: 'http://localhost:9999/callback'
  });
  assert.equal(badRedirect.body.error, 'invalid_grant');

  const unregistered = await authorize(pkce().challenge, { redirect_uri: 'https://attacker.example/callback' });
  assert.equal(unregistered.status, 400, 'redirect fora da allowlist nao redireciona');

  const otherResource = await authorize(pkce().challenge, { resource: 'https://attacker.example/mcp' });
  const location = new URL(otherResource.headers.get('location') ?? '');
  assert.equal(location.searchParams.get('error'), 'invalid_target');

  const plain = await authorize(pkce().challenge, { code_challenge_method: 'plain' });
  assert.equal(new URL(plain.headers.get('location') ?? '').searchParams.get('error'), 'invalid_request');
});

void test('users only see and revoke their own connections', { skip: !enabled }, async () => {
  const { code, verifier } = await obtainCode();
  const issued = await exchange(code, verifier);
  const grantId = issued.introspection?.grant_id ?? '';
  assert.ok((await connections.listGrants(operatorToken)).some((grant) => grant.id === grantId));
  assert.ok(!(await connections.listGrants(otherUserToken)).some((grant) => grant.id === grantId));
  await assert.rejects(() => connections.revokeGrant(otherUserToken, grantId), /Not Found/i);

  await connections.revokeGrant(operatorToken, grantId);
  assert.equal((await connections.introspect(serviceToken, issued.body.access_token)).active, false);
  const refresh = await token({ grant_type: 'refresh_token', refresh_token: issued.body.refresh_token });
  assert.equal(refresh.body.error, 'invalid_grant');
});

void test('introspection requires the platform service token', { skip: !enabled }, async () => {
  await assert.rejects(() => connections.introspect(operatorToken, 'x'), /Invalid service token/);
  const otherAudience = await jwt.issueServiceAccessToken(config.platformServiceClientId, 'svc:payments');
  await assert.rejects(() => connections.introspect(otherAudience, 'x'), /Invalid service token/);
  assert.deepEqual(await connections.introspect(serviceToken, 'not-a-token'), { active: false });
});
