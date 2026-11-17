import { QueryResultRow } from 'pg';

/**
 * Pacote de admin do cliente num modulo: as permissoes do catalogo marcadas com
 * `client_admin_default` (migration 133). Regra do usuario (2026-11-11): todo modulo contratado,
 * no cadastro ou depois, da ao admin do cliente todas as permissoes de admin daquele modulo.
 */
export interface AdminBundle {
  scopes: string[];
  roles: string[];
}

interface Queryable {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/** Sem catalogo para o app: so o papel de admin do cliente (nunca escopos inventados). */
export const FALLBACK_ADMIN_BUNDLE: AdminBundle = { scopes: [], roles: ['client_admin'] };

export async function loadAdminBundle(db: Queryable, applicationId: string): Promise<AdminBundle> {
  const result = await db.query<{ permission_type: string; permission_key: string }>(
    `SELECT permission_type, permission_key
     FROM application_permission_catalog
     WHERE application_id = $1 AND status = 'active' AND client_admin_default
     ORDER BY permission_type, permission_key`,
    [applicationId]
  );
  if (result.rows.length === 0) return FALLBACK_ADMIN_BUNDLE;
  return {
    scopes: result.rows.filter((row) => row.permission_type === 'scope').map((row) => row.permission_key),
    roles: result.rows.filter((row) => row.permission_type === 'role').map((row) => row.permission_key)
  };
}

/** Uniao sem repetir: conceder o pacote nunca tira o que o admin ja tinha. */
export function mergeBundle(current: AdminBundle, bundle: AdminBundle): AdminBundle {
  return {
    scopes: [...new Set([...current.scopes, ...bundle.scopes])],
    roles: [...new Set([...current.roles, ...bundle.roles])]
  };
}
