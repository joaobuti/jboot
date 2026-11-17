/**
 * Regra do app (`application_databases`, papel `primary`) -> registro de banco do cliente
 * (`database_refs`). Usado no cadastro do cliente e no "Aplicar regra atual"
 * (docs/product/tenant-isolation-sprints.md, Sprint 0).
 */
export interface ApplicationDatabaseRule {
  id: string;
  database_id?: string | null;
  isolation_strategy: string;
  connection_name?: string | null;
  default_database_name?: string | null;
}

export interface ExpectedDatabaseRef {
  databaseId: string | null;
  strategy: 'shared_db' | 'schema_per_client' | 'dedicated_db';
  connectionName: string;
  databaseName: string;
  schemaName: string | null;
  status: 'active' | 'provisioning';
  metadata: Record<string, unknown>;
}

/** So o compartilhado funciona de ponta a ponta hoje (schema e banco dedicado nao foram implementados). */
export const SUPPORTED_ISOLATION_STRATEGIES = ['shared_db'] as const;

export function isSupportedIsolation(strategy: string): boolean {
  return (SUPPORTED_ISOLATION_STRATEGIES as readonly string[]).includes(strategy);
}

/** `null` quando a regra e "sem banco". */
export function expectedDatabaseRef(rule: ApplicationDatabaseRule, applicationId: string, clientId: string): ExpectedDatabaseRef | null {
  if (rule.isolation_strategy === 'none') return null;
  const dedicated = rule.isolation_strategy === 'dedicated_database';
  return {
    databaseId: rule.database_id ?? null,
    strategy: dedicated ? 'dedicated_db' : (rule.isolation_strategy as 'shared_db' | 'schema_per_client'),
    connectionName: rule.connection_name ?? 'postgres.identity',
    databaseName: dedicated
      ? `app_${applicationId.replace(/-/g, '').slice(0, 8)}_c_${clientId.replace(/-/g, '').slice(0, 8)}`
      : rule.default_database_name ?? 'jboot_identity',
    schemaName: rule.isolation_strategy === 'schema_per_client' ? `client_${clientId.replace(/-/g, '_')}` : null,
    status: dedicated ? 'provisioning' : 'active',
    metadata: dedicated ? { provisioning: 'pending_worker' } : {}
  };
}

export interface CurrentDatabaseRef {
  id: string;
  databaseId: string | null;
  strategy: string;
  databaseName: string;
  schemaName: string | null;
  status: string;
}

/** O registro atual segue a regra (mesmo destino) e esta utilizavel? */
export function refFollowsRule(current: CurrentDatabaseRef | null, expected: ExpectedDatabaseRef | null): boolean {
  if (!expected) return current === null;
  if (!current) return false;
  return (
    current.strategy === expected.strategy &&
    current.databaseName === expected.databaseName &&
    (current.schemaName ?? null) === expected.schemaName &&
    (current.databaseId ?? null) === expected.databaseId &&
    current.status === expected.status
  );
}
