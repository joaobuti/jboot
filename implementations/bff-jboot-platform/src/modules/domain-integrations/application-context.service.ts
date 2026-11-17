import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  DomainApplicationSlug,
  DomainIntegrationRequestContext,
  ResolvedApplicationContext
} from './domain-integration.types';
import { DomainIntegrationsRepository } from './domain-integrations.repository';

@Injectable()
export class DomainApplicationContextService {
  constructor(private readonly repository: DomainIntegrationsRepository) {}

  async requireCaller(
    caller: DomainIntegrationRequestContext,
    applicationSlug: DomainApplicationSlug,
    requiredScopes: readonly string[]
  ): Promise<ResolvedApplicationContext> {
    if (requiredScopes.some((scope) => !caller.scopes.includes(scope))) {
      throw this.denied(applicationSlug);
    }
    const resolved = await this.requireApplication(caller, applicationSlug, requiredScopes);
    if (resolved.applicationId !== caller.applicationId || resolved.databaseRef !== caller.databaseRef) {
      throw this.denied(applicationSlug);
    }
    return resolved;
  }

  async requireApplication(
    caller: Pick<DomainIntegrationRequestContext, 'identityId' | 'clientId'>,
    applicationSlug: DomainApplicationSlug,
    requiredScopes: readonly string[]
  ): Promise<ResolvedApplicationContext> {
    const resolved = await this.repository.resolveApplicationContext(
      caller.identityId,
      caller.clientId,
      applicationSlug,
      requiredScopes
    );
    if (!resolved) {
      throw this.denied(applicationSlug);
    }
    return resolved;
  }

  private denied(applicationSlug: DomainApplicationSlug): ForbiddenException {
    return new ForbiddenException({
      code: applicationSlug === 'flow' ? 'flow_not_contracted' : 'juridico_not_authorized',
      message: `${applicationSlug} is not enabled for this client/user`
    });
  }
}
