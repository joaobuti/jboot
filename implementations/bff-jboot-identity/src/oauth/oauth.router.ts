import { Router } from 'express';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { AppConfigService } from '../config/app-config.service';
import { OAuthProviderService } from './oauth-provider.service';
import { FLOW_CONNECTOR_SCOPES, OFFLINE_ACCESS_SCOPE } from './oauth.types';

// Todo o trafego do Claude sai das mesmas faixas de IP da Anthropic; o limite
// por IP do SDK precisa caber varios usuarios simultaneos.
const WINDOW_MS = 15 * 60 * 1000;

export function authorizationServerMetadata(config: AppConfigService) {
  const issuer = config.oauthIssuerUrl;
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    // Cliente publico identificado por CIMD; o Claude exige `none` aqui.
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...FLOW_CONNECTOR_SCOPES, OFFLINE_ACCESS_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true
  };
}

/** Montado na raiz do app: o metadata fica em `<issuer>/.well-known/...`. */
export function buildOAuthRouter(provider: OAuthProviderService, config: AppConfigService): Router {
  const router = Router();
  router.use('/.well-known/oauth-authorization-server', metadataHandler(authorizationServerMetadata(config)));
  router.use('/oauth/authorize', authorizationHandler({ provider, rateLimit: { windowMs: WINDOW_MS, max: 600 } }));
  router.use('/oauth/token', tokenHandler({ provider, rateLimit: { windowMs: WINDOW_MS, max: 3000 } }));
  router.use('/oauth/revoke', revocationHandler({ provider, rateLimit: { windowMs: WINDOW_MS, max: 600 } }));
  return router;
}
