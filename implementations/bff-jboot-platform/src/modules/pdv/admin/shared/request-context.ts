import { PdvRequest } from '../guards/pdv-auth.guard';
import { MutateContext } from '../admin.types';

export function buildMutateContext(request: PdvRequest): MutateContext {
  return {
    ...request.pdvContext,
    userAgent: request.headers['user-agent'],
    ip: request.ip
  };
}
