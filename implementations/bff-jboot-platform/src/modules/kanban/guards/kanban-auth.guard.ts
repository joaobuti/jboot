import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AppConfigService } from '../../../config/app-config.service';
import { KanbanRequestContext } from '../kanban.types';
import { verifyKanbanToken } from '../shared/token';

export interface KanbanRequest extends Request {
  kanbanContext: KanbanRequestContext;
}

@Injectable()
export class KanbanAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<KanbanRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.kanbanContext = await verifyKanbanToken(this.config, token);
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
