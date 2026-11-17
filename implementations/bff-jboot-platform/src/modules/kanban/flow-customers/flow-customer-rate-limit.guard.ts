import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { KanbanRequest } from '../guards/kanban-auth.guard';

interface Bucket { count: number; resetAt: number }

/** Limite defensivo local da busca; nao usa CPF como chave nem registra o termo pesquisado. */
@Injectable()
export class FlowCustomerRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit = 60;
  private readonly windowMs = 60_000;

  canActivate(execution: ExecutionContext): boolean {
    const request = execution.switchToHttp().getRequest<KanbanRequest>();
    const now = Date.now();
    const key = `${request.kanbanContext.clientId}:${request.kanbanContext.identityId}`;
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) {
      throw new HttpException({ code: 'rate_limit_exceeded', message: 'Too many customer searches' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
    return true;
  }
}
