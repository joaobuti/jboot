import { All, Controller, Get, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { AppConfigService } from '../../../config/app-config.service';
import { ConnectorRateLimiter } from './connector-rate-limiter';
import { ConnectorAuthUnavailableError, ConnectorPrincipal, ConnectorTokenIntrospector, CONNECTOR_COMMENT_SCOPE, CONNECTOR_READ_SCOPE } from './connector-token.introspector';
import { FlowConnectorToolsService } from './flow-connector-tools.service';

const RESOURCE_METADATA_PATH = '.well-known/oauth-protected-resource/kanban/mcp';

/**
 * Endpoint MCP (Streamable HTTP, stateless) do conector Claude do Flow e o
 * protected resource metadata (RFC 9728) que aponta o Identity como
 * authorization server. Sem token valido responde 401 com
 * `WWW-Authenticate` (o Claude so inicia o login a partir de um 401).
 */
@ApiExcludeController()
@Controller()
export class FlowConnectorMcpController {
  private readonly logger = new Logger(FlowConnectorMcpController.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly introspector: ConnectorTokenIntrospector,
    private readonly tools: FlowConnectorToolsService,
    private readonly rateLimiter: ConnectorRateLimiter
  ) {}

  // Caminho com sufixo (RFC 9728, 3.1); a raiz abaixo cobre clientes que so sondam ela.
  @Get('.well-known/oauth-protected-resource/kanban/mcp')
  resourceMetadata() {
    return {
      resource: this.config.flowConnectorResourceUrl,
      authorization_servers: [this.config.identityOAuthIssuerUrl],
      scopes_supported: [CONNECTOR_READ_SCOPE, CONNECTOR_COMMENT_SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'JBoot Flow'
    };
  }

  @Get('.well-known/oauth-protected-resource')
  rootResourceMetadata() {
    return this.resourceMetadata();
  }

  @Post('kanban/mcp')
  async handle(@Req() request: Request, @Res() response: Response): Promise<void> {
    const principal = await this.authenticate(request, response);
    if (!principal) {
      return;
    }
    const retryAfter = this.rateLimiter.take(principal.grantId);
    if (retryAfter > 0) {
      response.setHeader('Retry-After', String(retryAfter));
      response.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null });
      return;
    }
    const server = this.tools.createServer(principal, { ip: request.ip, userAgent: request.get('user-agent') });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      this.logger.error(`MCP request failed: ${error instanceof Error ? error.message : 'unknown'}`);
      if (!response.headersSent) {
        response.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  }

  /** Modo stateless: sem stream SSE (GET) nem sessao para encerrar (DELETE). */
  @All('kanban/mcp')
  @HttpCode(405)
  methodNotAllowed(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Allow', 'POST');
    return { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null };
  }

  private async authenticate(request: Request, response: Response): Promise<ConnectorPrincipal | null> {
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      try {
        const principal = await this.introspector.introspect(token);
        if (principal) {
          return principal;
        }
      } catch (error) {
        if (error instanceof ConnectorAuthUnavailableError) {
          this.logger.error(`Connector auth unavailable: ${error.message}`);
          response.status(503).json({ error: 'temporarily_unavailable' });
          return null;
        }
        throw error;
      }
    }
    const metadataUrl = new URL(`/${RESOURCE_METADATA_PATH}`, this.config.flowConnectorResourceUrl).href;
    const challenge = token
      ? `Bearer resource_metadata="${metadataUrl}", error="invalid_token"`
      : `Bearer resource_metadata="${metadataUrl}"`;
    response.setHeader('WWW-Authenticate', challenge);
    response.status(401).json({ error: token ? 'invalid_token' : 'unauthorized' });
    return null;
  }
}
