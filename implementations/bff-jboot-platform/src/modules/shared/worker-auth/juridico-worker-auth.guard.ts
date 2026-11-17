import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { AppConfigService } from '../../../config/app-config.service';

@Injectable()
export class JuridicoWorkerAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authorization = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>().headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Missing service token');
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.config.jwtSecret), {
        issuer: this.config.identityIssuer,
        audience: 'svc:platform-api',
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'service_access' || payload.client_id !== this.config.juridicoWorkerServiceClientId) {
        throw new UnauthorizedException('Invalid service caller');
      }
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid service token');
    }
  }
}
