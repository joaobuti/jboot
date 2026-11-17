import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { AppConfigService } from '../config/app-config.service';
import { AuthContext } from './auth-context';
import { REQUIRED_SCOPES_KEY } from './required-scopes.decorator';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; auth?: AuthContext }>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Bearer token required');
    let payload;
    try { ({ payload } = await jwtVerify(token, new TextEncoder().encode(this.config.identityJwtSecret), { issuer: this.config.identityIssuer })); }
    catch { throw new UnauthorizedException('Invalid access token'); }
    if (typeof payload.sub !== 'string' || typeof payload.client_id !== 'string') throw new UnauthorizedException('Invalid access token');
    const scopes = Array.isArray(payload.scopes) ? payload.scopes.filter((v): v is string => typeof v === 'string') : [];
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (requiredScopes.some((scope) => !scopes.includes(scope))) throw new ForbiddenException('Insufficient scope');
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const moduleAudience = audiences.find((audience) => typeof audience === 'string' && audience.startsWith('app:'));
    if (typeof moduleAudience !== 'string') throw new UnauthorizedException('Module audience required');
    request.auth = {
        identityId: payload.sub,
        clientId: payload.client_id,
        applicationId: typeof payload.application_id === 'string' ? payload.application_id : undefined,
        applicationSlug: moduleAudience.slice(4),
        scopes,
        roles: Array.isArray(payload.roles) ? payload.roles.filter((v): v is string => typeof v === 'string') : [],
    };
    return true;
  }
}
