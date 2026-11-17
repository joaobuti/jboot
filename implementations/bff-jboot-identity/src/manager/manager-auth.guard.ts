import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Request } from 'express';
import { IdentityJwtService } from '../auth/jwt.service';
import { ManagerActor } from './manager.types';

export interface ManagerRequest extends Request {
  managerActor: ManagerActor;
}

@Injectable()
export class ManagerAuthGuard implements CanActivate {
  constructor(private readonly jwt: IdentityJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ManagerRequest>();
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = await this.jwt.verifyAccessToken(token);

    const canManageUsers = payload.scopes.some(scope => scope === 'users:manage' || scope.endsWith(':users:manage'));
    if (!canManageUsers) {
      throw new ForbiddenException('User management scope required');
    }
    if (!payload.clientId || !payload.applicationId) {
      throw new ForbiddenException('Token missing application context');
    }

    request.managerActor = {
      identityId: payload.sub,
      sessionId: payload.sid,
      clientId: payload.clientId,
      applicationId: payload.applicationId,
      locationId: payload.locationId,
      roles: payload.roles,
      scopes: payload.scopes
    };
    return true;
  }
}
