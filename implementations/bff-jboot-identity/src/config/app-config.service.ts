import { Injectable } from '@nestjs/common';

@Injectable()
export class AppConfigService {
  readonly port = Number(process.env.PORT ?? 8000);
  readonly databaseUrl =
    process.env.JBOOT_IDENTITY_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://jboot:jboot@postgres:5432/jboot_identity';
  readonly issuer = process.env.JBOOT_IDENTITY_ISSUER ?? 'jboot-identity';
  readonly jwtSecret =
    process.env.JBOOT_IDENTITY_JWT_SECRET ??
    'dev-only-jboot-identity-secret-change-before-production';
  readonly accessTokenTtlSeconds = Number(process.env.JBOOT_ACCESS_TOKEN_TTL_SECONDS ?? 900);
  readonly loginTicketTtlSeconds = Number(process.env.JBOOT_LOGIN_TICKET_TTL_SECONDS ?? 300);
  readonly platformServiceClientId = 'platform-api';
  readonly platformServiceClientSecret = process.env.JBOOT_IDENTITY_PLATFORM_SERVICE_CLIENT_SECRET ?? '';
  readonly workerServiceClientId = 'juridico-worker';
  readonly workerServiceClientSecret = process.env.JBOOT_IDENTITY_JURIDICO_WORKER_SERVICE_CLIENT_SECRET ?? '';
  readonly platformServiceAudiences = new Set(['svc:juridico-data', 'svc:payments', 'svc:identity-oauth', 'svc:ai-gateway']);
  readonly workerServiceAudiences = new Set(['svc:platform-api']);
  readonly serviceAccessTokenTtlSeconds = 120;
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://valkey:6379';
  // `trust proxy` do Express (saltos de proxy reverso ou `true`); ausente = sem proxy (dev).
  readonly trustProxy = parseTrustProxy(process.env.JBOOT_IDENTITY_TRUST_PROXY);
  // Links de criar/redefinir senha apontam para a tela publica do app do Identity (onde fica o login).
  readonly identityWebUrl = trimSlash(process.env.JBOOT_IDENTITY_WEB_URL || 'http://localhost:3000');
  readonly inviteTtlHours = Number(process.env.JBOOT_IDENTITY_INVITE_TTL_HOURS ?? 72);
  readonly passwordResetTtlMinutes = Number(process.env.JBOOT_IDENTITY_PASSWORD_RESET_TTL_MINUTES ?? 60);
  // SMTP do e-mail do sistema (convite e recuperacao de senha), mesmas envs da plataforma
  // (docs/product/account-access-email-sprints.md). Em dev, Mailpit.
  readonly smtp = {
    host: process.env.SMTP_HOST ?? 'mailpit',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT ?? 1025) === 465,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'JBoot <nao-responda@jboot.local>'
  };
  readonly identityApplicationsCacheTtlSeconds = Number(
    process.env.JBOOT_IDENTITY_APPLICATIONS_CACHE_TTL_SECONDS ?? 300
  );
  // Servidor OAuth do conector Claude do Flow
  // (docs/product/kanban-claude-connector-sprints.md). Issuer e recurso sao
  // URLs publicas: o Claude chama de fora (egress Anthropic 160.79.104.0/21).
  readonly oauthIssuerUrl = trimSlash(process.env.JBOOT_IDENTITY_OAUTH_ISSUER_URL || 'http://localhost:8000');
  readonly oauthConsentUrl = process.env.JBOOT_IDENTITY_OAUTH_CONSENT_URL || 'http://localhost:3002/oauth/consentimento';
  readonly flowConnectorResourceUrl = process.env.JBOOT_FLOW_CONNECTOR_RESOURCE_URL || 'http://localhost:8010/kanban/mcp';
  readonly flowConnectorApplicationSlug = 'flow';
  // CIMD: so documentos de cliente hospedados nestes hosts sao aceitos.
  readonly oauthCimdAllowedHosts = csv(process.env.JBOOT_IDENTITY_OAUTH_CIMD_ALLOWED_HOSTS || 'claude.ai');
  // Redirects aceitos mesmo que o documento CIMD declare outros. Loopback
  // casa com qualquer porta (RFC 8252), exigencia do Claude Code.
  readonly oauthAllowedRedirectUris = csv(
    process.env.JBOOT_IDENTITY_OAUTH_ALLOWED_REDIRECT_URIS ||
      'https://claude.ai/api/mcp/auth_callback,http://localhost/callback,http://127.0.0.1/callback'
  );
  readonly oauthAuthorizationRequestTtlSeconds = 600;
  readonly oauthAuthorizationCodeTtlSeconds = 120;
  readonly oauthAccessTokenTtlSeconds = Number(process.env.JBOOT_IDENTITY_OAUTH_ACCESS_TOKEN_TTL_SECONDS || 3600);
  readonly oauthRefreshTokenTtlSeconds = Number(process.env.JBOOT_IDENTITY_OAUTH_REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 3600);
  readonly corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function csv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseTrustProxy(value: string | undefined): number | boolean | string | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}
