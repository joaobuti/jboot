import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AppConfigService } from '../../../config/app-config.service';
import { PlatformNotificationContext } from '../notifications.types';
import { verifyPlatformToken } from '../shared/platform-token';

export interface PlatformNotificationsRequest extends Request {
  platformNotificationContext: PlatformNotificationContext;
}

@Injectable()
export class PlatformNotificationsAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformNotificationsRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.platformNotificationContext = await verifyPlatformToken(this.config, token);
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim();
  }
}
