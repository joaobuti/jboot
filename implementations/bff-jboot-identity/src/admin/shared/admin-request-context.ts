import { getRequestContext } from '../../shared/request-context';
import { MutateContext } from '../admin.types';
import { AdminRequest } from '../guards/admin-auth.guard';

export function buildMutateContext(request: AdminRequest): MutateContext {
  const context = getRequestContext(request);
  return {
    actor: request.adminActor,
    ip: context.ip,
    userAgent: context.userAgent
  };
}
