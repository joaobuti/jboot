import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Request } from 'express';
import { IdentityJwtService } from '../../auth/jwt.service';
import { AdminActor } from '../admin.types';

export interface AdminRequest extends Request {
  adminActor: AdminActor;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwt: IdentityJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = await this.jwt.verifyAccessToken(token);
    if (!payload.roles.includes('global_admin') || !payload.scopes.includes('identity:admin')) {
      throw new ForbiddenException('Admin access required');
    }

    request.adminActor = {
      identityId: payload.sub,
      sessionId: payload.sid,
      roles: payload.roles,
      scopes: payload.scopes
    };
    return true;
  }
}
