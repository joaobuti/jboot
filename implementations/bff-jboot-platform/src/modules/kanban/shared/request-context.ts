import { KanbanRequest } from '../guards/kanban-auth.guard';
import { MutateContext } from '../kanban.types';

export function buildMutateContext(request: KanbanRequest): MutateContext {
  return {
    ...request.kanbanContext,
    userAgent: request.headers['user-agent'],
    ip: request.ip
  };
}
