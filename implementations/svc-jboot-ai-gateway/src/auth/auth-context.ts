import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthContext { identityId: string; clientId: string; applicationId?: string; applicationSlug: string; scopes: string[]; roles: string[] }
export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => context.switchToHttp().getRequest<{ auth: AuthContext }>().auth);
