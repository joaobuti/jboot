import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { KanbanRequest } from '../guards/kanban-auth.guard';

/** Per-process limit; expired keys are pruned so identities cannot grow memory without bound. */
@Injectable()
export class CardActionsRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  canActivate(execution: ExecutionContext): boolean {
    const request = execution.switchToHttp().getRequest<KanbanRequest>();
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    const key = `${request.kanbanContext.clientId}:${request.kanbanContext.identityId}`;
    const bucket = this.buckets.get(key) ?? { count: 0, resetAt: now + 60_000 };
    if (bucket.count >= 120) {
      throw new HttpException({ code: 'card_actions_rate_limited', message: 'Muitas requisições de ações. Aguarde um minuto.' }, 429);
    }
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
