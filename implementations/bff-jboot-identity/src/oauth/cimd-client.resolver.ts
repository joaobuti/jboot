import { Injectable, Logger } from '@nestjs/common';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AppConfigService } from '../config/app-config.service';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const MAX_DOCUMENT_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Client ID Metadata Document (CIMD): o `client_id` e a URL HTTPS de um JSON
 * publicado pelo proprio cliente (o Claude publica o seu). Nao ha cadastro
 * dinamico (DCR): so documentos de hosts allowlisted sao buscados, sem seguir
 * redirect e com tamanho limitado, para que o `client_id` nao vire SSRF.
 */
@Injectable()
export class CimdClientResolver {
  private readonly logger = new Logger(CimdClientResolver.name);
  private readonly cache = new Map<string, { client: OAuthClientInformationFull; expiresAt: number }>();
  private fetcher: Fetcher = (input, init) => fetch(input, init);

  constructor(private readonly config: AppConfigService) {}

  /** Somente testes. */
  useFetcher(fetcher: Fetcher): void {
    this.fetcher = fetcher;
  }

  async resolve(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.client;
    }

    const url = this.parseClientIdUrl(clientId);
    if (!url) {
      return undefined;
    }

    try {
      const client = this.validateDocument(clientId, await this.fetchDocument(url));
      if (!client) {
        return undefined;
      }
      if (this.cache.size > 1_000) this.cache.clear();
      this.cache.set(clientId, { client, expiresAt: Date.now() + CACHE_TTL_MS });
      return client;
    } catch (error) {
      this.logger.warn(`CIMD fetch failed for host ${url.hostname}: ${error instanceof Error ? error.message : 'unknown'}`);
      return undefined;
    }
  }

  /** Redirect aceito: igual a um configurado; loopback casa com qualquer porta. */
  isAllowedRedirectUri(candidate: string): boolean {
    return this.config.oauthAllowedRedirectUris.some((allowed) => redirectMatches(candidate, allowed));
  }

  private parseClientIdUrl(clientId: string): URL | null {
    let url: URL;
    try {
      url = new URL(clientId);
    } catch {
      return null;
    }
    const allowedHost = this.config.oauthCimdAllowedHosts.includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' || !allowedHost || url.username || url.password || url.hash || url.pathname === '/' || url.port) {
      return null;
    }
    return url;
  }

  private async fetchDocument(url: URL): Promise<unknown> {
    const response = await this.fetcher(url.href, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_DOCUMENT_BYTES) {
      throw new Error('document too large');
    }
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw new Error('document too large');
    }
    return JSON.parse(body) as unknown;
  }

  private validateDocument(clientId: string, document: unknown): OAuthClientInformationFull | null {
    if (!document || typeof document !== 'object') {
      return null;
    }
    const doc = document as Record<string, unknown>;
    // O documento precisa declarar exatamente a URL de onde veio.
    if (doc.client_id !== clientId) {
      return null;
    }
    const authMethod = doc.token_endpoint_auth_method;
    if (authMethod !== undefined && authMethod !== 'none') {
      return null;
    }
    const grantTypes = doc.grant_types;
    if (grantTypes !== undefined && !(Array.isArray(grantTypes) && grantTypes.includes('authorization_code'))) {
      return null;
    }
    const redirectUris = Array.isArray(doc.redirect_uris)
      ? doc.redirect_uris.filter((uri): uri is string => typeof uri === 'string' && this.isAllowedRedirectUri(uri))
      : [];
    if (redirectUris.length === 0) {
      return null;
    }
    const clientName = typeof doc.client_name === 'string' && doc.client_name.trim()
      ? doc.client_name.trim().slice(0, 120)
      : new URL(clientId).hostname;

    return {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    };
  }
}

export function redirectMatches(candidate: string, allowed: string): boolean {
  if (candidate === allowed) {
    return true;
  }
  let requested: URL;
  let registered: URL;
  try {
    requested = new URL(candidate);
    registered = new URL(allowed);
  } catch {
    return false;
  }
  return (
    LOOPBACK_HOSTS.has(requested.hostname) &&
    requested.hostname === registered.hostname &&
    requested.protocol === 'http:' &&
    registered.protocol === 'http:' &&
    requested.pathname === registered.pathname &&
    requested.search === registered.search &&
    !requested.hash
  );
}
