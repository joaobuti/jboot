import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PdvRequest } from './pdv-auth.guard';

export const REQUIRED_SCOPES_KEY = 'requiredScopes';

export function RequireScopes(...scopes: string[]) {
  return SetMetadata(REQUIRED_SCOPES_KEY, scopes);
}

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredScopes?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PdvRequest>();
    const available = new Set(request.pdvContext.scopes);
    const allowed = requiredScopes.some((scope) => available.has(scope));
    if (!allowed) {
      throw new ForbiddenException('Insufficient scope');
    }
    return true;
  }
}
