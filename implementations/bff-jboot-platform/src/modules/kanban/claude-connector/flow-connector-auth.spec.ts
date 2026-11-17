import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { ConnectorRateLimiter } from './connector-rate-limiter';
import { ConnectorAuthUnavailableError, ConnectorTokenIntrospector } from './connector-token.introspector';
import { FlowConnectorMcpController } from './flow-connector-mcp.controller';

const config = {
  flowConnectorResourceUrl: 'https://apinode.jboot.test/kanban/mcp',
  identityOAuthIssuerUrl: 'https://auth.jboot.test',
  identityServiceUrl: 'http://identity.internal',
  platformServiceClientId: 'platform-api',
  platformServiceClientSecret: 'secret'
};

function fakeResponse() {
  const state: { status?: number; headers: Record<string, string>; body?: unknown } = { headers: {} };
  const response = {
    headersSent: false,
    setHeader: (name: string, value: string) => { state.headers[name.toLowerCase()] = value; },
    status: (code: number) => { state.status = code; return response; },
    json: (body: unknown) => { state.body = body; return response; },
    on: () => response
  };
  return { response, state };
}

function fakeRequest(authorization?: string) {
  return { get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined), body: {}, ip: '127.0.0.1' };
}

void describe('FlowConnectorMcpController authentication', () => {
  void it('publishes protected resource metadata pointing to the Identity issuer', () => {
    const controller = new FlowConnectorMcpController(config as never, {} as never, {} as never, new ConnectorRateLimiter());
    const metadata = controller.resourceMetadata();
    assert.equal(metadata.resource, config.flowConnectorResourceUrl);
    assert.deepEqual(metadata.authorization_servers, ['https://auth.jboot.test']);
  });

  void it('answers 401 with resource_metadata when there is no token', async () => {
    const controller = new FlowConnectorMcpController(config as never, { introspect: async () => null } as never, {} as never, new ConnectorRateLimiter());
    const { response, state } = fakeResponse();
    await controller.handle(fakeRequest() as never, response as never);
    assert.equal(state.status, 401);
    assert.equal(
      state.headers['www-authenticate'],
      'Bearer resource_metadata="https://apinode.jboot.test/.well-known/oauth-protected-resource/kanban/mcp"'
    );
  });

  void it('flags invalid tokens so Claude refreshes or reconnects', async () => {
    const controller = new FlowConnectorMcpController(config as never, { introspect: async () => null } as never, {} as never, new ConnectorRateLimiter());
    const { response, state } = fakeResponse();
    await controller.handle(fakeRequest('Bearer revoked') as never, response as never);
    assert.equal(state.status, 401);
    assert.match(state.headers['www-authenticate'], /error="invalid_token"/);
  });

  void it('answers 503 instead of 401 when Identity cannot be reached', async () => {
    const introspector = { introspect: async () => { throw new ConnectorAuthUnavailableError('identity_unreachable'); } };
    const controller = new FlowConnectorMcpController(config as never, introspector as never, {} as never, new ConnectorRateLimiter());
    const { response, state } = fakeResponse();
    await controller.handle(fakeRequest('Bearer any') as never, response as never);
    assert.equal(state.status, 503);
    assert.equal(state.headers['www-authenticate'], undefined);
  });
});

void describe('ConnectorTokenIntrospector', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  function stubIdentity(introspection: Record<string, unknown>) {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      if (url.endsWith('/auth/service-token')) {
        assert.equal(JSON.parse(String(init.body)).audience, 'svc:identity-oauth');
        return new Response(JSON.stringify({ accessToken: 'svc', tokenType: 'Bearer', expiresIn: 120 }));
      }
      assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer svc');
      return new Response(JSON.stringify(introspection));
    }) as typeof fetch;
    return calls;
  }

  const active = {
    active: true, sub: 'u1', scope: 'flow:connector:read', aud: config.flowConnectorResourceUrl, grant_id: 'g1',
    tenant_client_id: 'c1', application_id: 'a1', database_ref: 'db1', flow_scopes: ['flow:read'], flow_roles: []
  };

  void it('builds the kanban context only from the introspection result', async () => {
    stubIdentity(active);
    const principal = await new ConnectorTokenIntrospector(config as never).introspect('opaque');
    assert.deepEqual(principal?.context, {
      identityId: 'u1', clientId: 'c1', applicationId: 'a1', databaseRef: 'db1', scopes: ['flow:read'], roles: []
    });
    assert.deepEqual(principal?.connectorScopes, ['flow:connector:read']);
  });

  void it('rejects inactive tokens, other audiences and users without flow:read', async () => {
    for (const body of [{ active: false }, { ...active, aud: 'https://other/mcp' }, { ...active, flow_scopes: ['flow:write'] }]) {
      stubIdentity(body);
      assert.equal(await new ConnectorTokenIntrospector(config as never).introspect('opaque'), null);
    }
  });

  void it('reports Identity outages as unavailable, not as an invalid token', async () => {
    globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await assert.rejects(() => new ConnectorTokenIntrospector(config as never).introspect('opaque'), ConnectorAuthUnavailableError);
  });
});

void describe('ConnectorRateLimiter', () => {
  void it('limits each grant independently and reports when it frees up', () => {
    const limiter = new ConnectorRateLimiter();
    const start = 1_000_000;
    for (let index = 0; index < 120; index += 1) {
      assert.equal(limiter.take('grant-a', start + index), 0);
    }
    const wait = limiter.take('grant-a', start + 500);
    assert.ok(wait > 0 && wait <= 60, String(wait));
    assert.equal(limiter.take('grant-b', start + 500), 0, 'outra conexao nao e afetada');
    assert.equal(limiter.take('grant-a', start + 60_001), 0, 'libera quando a janela passa');
  });

  void it('answers 429 with Retry-After once the grant is over the limit', async () => {
    const principal = { grantId: 'g-limit', connectorScopes: [], context: {} };
    const limiter = new ConnectorRateLimiter();
    for (let index = 0; index < 120; index += 1) limiter.take('g-limit');
    const controller = new FlowConnectorMcpController(config as never, { introspect: async () => principal } as never, {} as never, limiter);
    const { response, state } = fakeResponse();
    await controller.handle(fakeRequest('Bearer ok') as never, response as never);
    assert.equal(state.status, 429);
    assert.ok(Number(state.headers['retry-after']) > 0);
  });
});
