import { BadGatewayException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { ProvisionFlowIdentityDto } from './dto/provision-flow-user.dto';

@Injectable()
export class FlowIdentityClient {
  constructor(private readonly config: AppConfigService) {}

  async createUser(authorization: string, identity: ProvisionFlowIdentityDto): Promise<string> {
    const response = await fetch(`${this.config.identityServiceUrl}/manager/users`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(identity),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      throw new BadGatewayException({ code: 'identity_user_provisioning_failed', message: 'Identity rejected user provisioning' });
    }
    const body = await response.json() as { identityId?: unknown };
    if (typeof body.identityId !== 'string') {
      throw new BadGatewayException({ code: 'identity_invalid_response', message: 'Identity returned an invalid response' });
    }
    return body.identityId;
  }

  /**
   * Acrescenta permissoes do modulo a um usuario, sem tirar as que ele tem (flow-offices-sprints.md, S4).
   * A rota do Identity substitui o conjunto do catalogo: le o atual e o catalogo, une e grava.
   * Usa o token de quem pede (precisa de `users:manage` no Identity).
   */
  async grantModuleScopes(authorization: string, identityId: string, scopes: string[]): Promise<void> {
    const headers = { authorization, 'content-type': 'application/json' };
    const [usersResponse, catalogResponse] = await Promise.all([
      fetch(`${this.config.identityServiceUrl}/manager/users`, { headers, signal: AbortSignal.timeout(10_000) }),
      fetch(`${this.config.identityServiceUrl}/manager/module-permissions`, { headers, signal: AbortSignal.timeout(10_000) })
    ]);
    if (!usersResponse.ok || !catalogResponse.ok) {
      throw new BadGatewayException({ code: 'identity_permissions_unavailable', message: 'Identity did not return users or catalog' });
    }
    const users = await usersResponse.json() as Array<{ identityId: string; scopes?: string[]; roles?: string[] }>;
    const catalog = await catalogResponse.json() as { scopes: Array<{ key: string }>; roles: Array<{ key: string }> };
    const target = users.find((user) => user.identityId === identityId);
    if (!target) throw new BadGatewayException({ code: 'identity_user_not_found', message: 'User is not in this module' });
    const allowedScopes = new Set(catalog.scopes.map((item) => item.key));
    const allowedRoles = new Set(catalog.roles.map((item) => item.key));
    const merged = {
      scopes: [...new Set([...(target.scopes ?? []).filter((scope) => allowedScopes.has(scope)), ...scopes.filter((scope) => allowedScopes.has(scope))])],
      roles: (target.roles ?? []).filter((role) => allowedRoles.has(role))
    };
    const response = await fetch(`${this.config.identityServiceUrl}/manager/users/${identityId}/module-permissions`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(merged),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      throw new BadGatewayException({ code: 'identity_permissions_rejected', message: 'Identity rejected the permission change' });
    }
  }
}
