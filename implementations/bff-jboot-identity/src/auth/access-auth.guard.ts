import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { IdentityJwtService } from './jwt.service';

export interface AuthenticatedRequest extends Request {
  identityId: string;
  clientId?: string;
  applicationId?: string;
}

@Injectable()
export class AccessAuthGuard implements CanActivate {
  constructor(private readonly jwt: IdentityJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = await this.jwt.verifyAccessToken(token);
    request.identityId = payload.sub;
    request.clientId = payload.clientId;
    request.applicationId = payload.applicationId;
    return true;
  }
}
