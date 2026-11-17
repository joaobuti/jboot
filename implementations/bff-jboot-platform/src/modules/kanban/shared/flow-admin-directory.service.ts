import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { FLOW_ADMIN_SCOPE } from './card-visibility';
import { KanbanRequestContext } from '../kanban.types';

export interface FlowUserSummary {
  identityId: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
}

const ADMIN_CACHE_TTL_MS = 60_000;

/**
 * Diretorio de usuarios do Flow (ADR 014, Decisao 7). Ponto UNICO que le
 * `jboot_identity.entitlements`/`identities` para saber quem e administrador
 * (`flow:admin`) fora de uma requisicao (destinatario de notificacao/e-mail,
 * candidato a responsavel) e quem tem acesso ao Flow no tenant.
 *
 * Somente leitura (SELECT), mesmo acesso de `MembersRepository.findCandidates`
 * e `ScheduledAutomationRepository.listActiveFlowTenants`. Na requisicao, a
 * autoridade continua sendo o scope do JWT. Cache em memoria de ate 60 s por
 * tenant para a lista de administradores. Se o Identity expuser API de
 * diretorio, so esta classe muda.
 */
@Injectable()
export class FlowAdminDirectory {
  private readonly adminCache = new Map<string, { expiresAt: number; ids: Set<string> }>();
  /** Relogio do cache (substituivel em teste). */
  now: () => number = Date.now;

  constructor(private readonly database: DatabaseService) {}

  async adminIdentityIds(clientId: string): Promise<Set<string>> {
    const cached = this.adminCache.get(clientId);
    const now = this.now();
    if (cached && cached.expiresAt > now) {
      return cached.ids;
    }
    const users = await this.queryFlowUsers(clientId, true);
    const ids = new Set(users.map((user) => user.identityId));
    this.adminCache.set(clientId, { expiresAt: now + ADMIN_CACHE_TTL_MS, ids });
    return ids;
  }

  async isAdmin(clientId: string, identityId: string): Promise<boolean> {
    return (await this.adminIdentityIds(clientId)).has(identityId);
  }

  /** Usuarios ativos com entitlement ativo no Flow do tenant (tela de escritorios). Sem cache. */
  async listFlowUsers(clientId: string): Promise<FlowUserSummary[]> {
    return this.queryFlowUsers(clientId, false);
  }

  /** No cache: an automation must not retain revoked tenant/Flow permissions. */
  async automationActor(databaseRef: string, clientId: string, identityId: string): Promise<KanbanRequestContext | null> {
    const result = await this.database.queryIdentity<KanbanRequestContext>(
      `SELECT i.id AS "identityId",e.client_id AS "clientId",e.application_id AS "applicationId",
        dr.id AS "databaseRef",e.scopes,e.roles
       FROM entitlements e JOIN identities i ON i.id=e.identity_id
       JOIN memberships m ON m.identity_id=i.id AND m.client_id=e.client_id AND m.status='active'
       JOIN applications a ON a.id=e.application_id AND a.slug='flow' AND a.status='active'
       JOIN database_refs dr ON dr.id=$1 AND dr.client_id=e.client_id AND dr.application_id=a.id AND dr.status='active'
       WHERE e.client_id=$2 AND e.identity_id=$3 AND e.status='active' AND i.status='active'
         AND 'flow:read'=ANY(e.scopes) AND 'flow:write'=ANY(e.scopes) AND 'flow:admin'=ANY(e.scopes) LIMIT 1`,
      [databaseRef,clientId,identityId]);
    return result.rows[0] ?? null;
  }

  private async queryFlowUsers(clientId: string, adminsOnly: boolean): Promise<FlowUserSummary[]> {
    const result = await this.database.queryIdentity<FlowUserSummary>(
      `SELECT i.id AS "identityId", i.display_name AS "displayName", i.email::text AS email,
              ($2::text = ANY(e.scopes)) AS "isAdmin"
       FROM entitlements e
       JOIN identities i ON i.id = e.identity_id
       WHERE e.client_id = $1
         AND e.application_id = (SELECT id FROM applications WHERE slug = 'flow')
         AND e.status = 'active'
         AND i.status = 'active'
         AND ($3::boolean = false OR $2::text = ANY(e.scopes))
       ORDER BY i.display_name, i.id
       LIMIT 1000`,
      [clientId, FLOW_ADMIN_SCOPE, adminsOnly]
    );
    return result.rows;
  }
}
