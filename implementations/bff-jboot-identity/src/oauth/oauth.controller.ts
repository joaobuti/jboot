import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OAuthConnectionsService } from './oauth-connections.service';
import { OAuthDecisionDto, OAuthIntrospectDto } from './oauth.dto';

/**
 * APIs JSON do conector Claude do Flow. Os endpoints do protocolo OAuth
 * (`/oauth/authorize`, `/oauth/token`, `/oauth/revoke` e metadata) sao
 * montados em `oauth.router.ts` com os handlers do SDK MCP.
 */
@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly connections: OAuthConnectionsService) {}

  @Get('requests/:requestId')
  getRequest(@Param('requestId', ParseUUIDPipe) requestId: string, @Req() request: Request) {
    return this.connections.getAuthorizationRequest(bearer(request), requestId);
  }

  @Post('requests/:requestId/decision')
  @HttpCode(200)
  decide(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: OAuthDecisionDto, @Req() request: Request) {
    return this.connections.decide(bearer(request), requestId, dto.approve);
  }

  @Get('grants')
  async listGrants(@Req() request: Request) {
    return { data: await this.connections.listGrants(bearer(request)) };
  }

  @Delete('grants/:grantId')
  @HttpCode(204)
  async revokeGrant(@Param('grantId', ParseUUIDPipe) grantId: string, @Req() request: Request) {
    await this.connections.revokeGrant(bearer(request), grantId);
  }

  @Post('introspect')
  @HttpCode(200)
  introspect(@Body() dto: OAuthIntrospectDto, @Req() request: Request) {
    return this.connections.introspect(bearer(request), dto.token);
  }
}

function bearer(request: Request): string {
  const header = request.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) {
    throw new UnauthorizedException('Missing bearer token');
  }
  return token;
}
