import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { KanbanRequestContext } from '../modules/kanban/kanban.types';
import { TEST_DATABASE_REF } from './with-test-database';

/**
 * Cenario de escritorios em banco real (CRM de leads, Sprint 3.5): um quadro,
 * escritorios A, B e C (inativo), cards de A, de B e sem escritorio, e os
 * perfis de usuario da matriz de visibilidade. Todos os membros tem perfil com
 * todas as capacidades, para que 403 so venha de membresia/papel.
 */
export interface OfficeScenario {
  clientId: string;
  otherClientId: string;
  boardId: string;
  columnId: string;
  profileId: string;
  officeA: string;
  officeB: string;
  officeInactive: string;
  cardA: string;
  cardB: string;
  cardNull: string;
  users: {
    /** `flow:admin`, NAO membro do quadro, sem escritorio. */
    admin: string;
    memberA: string;
    memberB: string;
    memberAB: string;
    /** Membro ativo sem escritorio. */
    noOffice: string;
    /** Membro INATIVO do quadro, escritorio A. */
    inactiveA: string;
    /** Nao membro, escritorio A. */
    outsiderA: string;
    /** Membro so do escritorio inativo. */
    onlyInactiveOffice: string;
    /** `board_admin` do quadro SEM `flow:admin`, escritorio A (P25: ve so o proprio escritorio). */
    boardAdminA: string;
  };
}

export type ScenarioUser = keyof OfficeScenario['users'];

export async function seedOfficeScenario(client: Client, options: { enabled: boolean }): Promise<OfficeScenario> {
  const s: OfficeScenario = {
    clientId: randomUUID(),
    otherClientId: randomUUID(),
    boardId: randomUUID(),
    columnId: randomUUID(),
    profileId: randomUUID(),
    officeA: randomUUID(),
    officeB: randomUUID(),
    officeInactive: randomUUID(),
    cardA: randomUUID(),
    cardB: randomUUID(),
    cardNull: randomUUID(),
    users: {
      admin: randomUUID(),
      memberA: randomUUID(),
      memberB: randomUUID(),
      memberAB: randomUUID(),
      noOffice: randomUUID(),
      inactiveA: randomUUID(),
      outsiderA: randomUUID(),
      onlyInactiveOffice: randomUUID(),
      boardAdminA: randomUUID()
    }
  };
  const owner = randomUUID();
  const u = s.users;
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Leads', $3)`, [
    s.boardId,
    s.clientId,
    owner
  ]);
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position, is_default) VALUES ($1, $2, $3, 'BACKLOG', 0, true)`,
    [s.columnId, s.clientId, s.boardId]
  );
  await client.query(
    `INSERT INTO kanban_member_profiles (id, client_id, board_id, name, can_delete_archived_cards, can_manage_tags, can_manage_statuses, can_review_documents)
     VALUES ($1, $2, $3, 'Operador', true, true, true, true)`,
    [s.profileId, s.clientId, s.boardId]
  );
  await client.query(
    `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role, status, profile_id) VALUES
       ($1, $2, $3, 'board_admin', 'active', NULL),
       ($1, $2, $4, 'board_member', 'active', $10),
       ($1, $2, $5, 'board_member', 'active', $10),
       ($1, $2, $6, 'board_member', 'active', $10),
       ($1, $2, $7, 'board_member', 'active', $10),
       ($1, $2, $8, 'board_member', 'inactive', $10),
       ($1, $2, $9, 'board_member', 'active', $10),
       ($1, $2, $11, 'board_admin', 'active', NULL)`,
    [s.clientId, s.boardId, owner, u.memberA, u.memberB, u.memberAB, u.noOffice, u.inactiveA, u.onlyInactiveOffice, s.profileId, u.boardAdminA]
  );
  await client.query(
    `INSERT INTO kanban_offices (id, client_id, name, active, created_by_identity_id) VALUES
       ($1, $4, 'Escritorio A', true, $5), ($2, $4, 'Escritorio B', true, $5), ($3, $4, 'Escritorio Antigo', false, $5)`,
    [s.officeA, s.officeB, s.officeInactive, s.clientId, owner]
  );
  const links: Array<[string, string]> = [
    [u.memberA, s.officeA],
    [u.memberB, s.officeB],
    [u.memberAB, s.officeA],
    [u.memberAB, s.officeB],
    [u.inactiveA, s.officeA],
    [u.outsiderA, s.officeA],
    [u.onlyInactiveOffice, s.officeInactive],
    [u.boardAdminA, s.officeA]
  ];
  for (const [identityId, officeId] of links) {
    await client.query(
      `INSERT INTO kanban_user_offices (client_id, identity_id, office_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
      [s.clientId, identityId, officeId, owner]
    );
  }
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id, office_id) VALUES
       ($1, $4, $5, $6, 'Lead A', 0, $7, $8),
       ($2, $4, $5, $6, 'Lead B', 1, $7, $9),
       ($3, $4, $5, $6, 'Lead sem escritorio', 2, $7, NULL)`,
    [s.cardA, s.cardB, s.cardNull, s.clientId, s.boardId, s.columnId, owner, s.officeA, s.officeB]
  );
  await setOfficeVisibility(client, s.clientId, options.enabled);
  return s;
}

export async function setOfficeVisibility(client: Client, clientId: string, enabled: boolean): Promise<void> {
  await client.query(
    `INSERT INTO kanban_settings (client_id, office_visibility_enabled) VALUES ($1, $2)
     ON CONFLICT (client_id) DO UPDATE SET office_visibility_enabled = EXCLUDED.office_visibility_enabled`,
    [clientId, enabled]
  );
}

export function scenarioContext(
  s: OfficeScenario,
  user: ScenarioUser | 'otherTenant',
  extraScopes: string[] = []
): KanbanRequestContext {
  const identityId = user === 'otherTenant' ? s.users.memberA : s.users[user];
  const scopes = ['flow:read', 'flow:write', ...(user === 'admin' ? ['flow:admin'] : []), ...extraScopes];
  return {
    identityId,
    clientId: user === 'otherTenant' ? s.otherClientId : s.clientId,
    applicationId: 'app',
    databaseRef: TEST_DATABASE_REF,
    scopes,
    roles: []
  };
}
