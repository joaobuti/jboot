import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseService } from '../../database/database.service';
import { ClientOnboardingRepository } from './client-onboarding.repository';
import { CreateClientOnboardingDto } from './dto/client-onboarding.dto';

class DatabaseServiceStub {
  queries: { sql: string; params: unknown[] }[] = [];

  async transaction<T>(callback: (client: never) => Promise<T>) {
    return callback({
      query: async (sql: string, params: unknown[] = []) => {
        this.queries.push({ sql, params });

        if (sql.includes('FROM application_databases')) {
          return {
            rows: [{
              id: `app-db-${params[0]}`,
              database_id: `database-${params[0]}`,
              isolation_strategy: 'shared_db',
              connection_name: 'postgres.identity',
              default_database_name: 'jboot_identity',
            }],
          };
        }

        if (sql.includes('INSERT INTO clients')) {
          return { rows: [{ id: 'client-1', legalName: 'Cliente Demo' }] };
        }

        if (sql.includes('INSERT INTO identities')) {
          return { rows: [{ id: 'identity-1', displayName: 'Operador' }] };
        }

        if (sql.includes('INSERT INTO client_applications')) {
          return { rows: [{ id: `client-app-${params[1]}`, clientId: params[0], applicationId: params[1] }] };
        }

        if (sql.includes('INSERT INTO database_refs')) {
          return { rows: [{ id: `database-ref-${params[0]}`, applicationId: params[0], clientId: params[1] }] };
        }

        if (sql.includes('INSERT INTO memberships')) {
          return { rows: [{ id: 'membership-1', identityId: params[0], clientId: params[1] }] };
        }

        if (sql.includes('INSERT INTO entitlements')) {
          return { rows: [{ id: `entitlement-${params[2]}`, identityId: params[0], clientId: params[1], applicationId: params[2] }] };
        }

        return { rows: [] };
      },
    } as never);
  }
}

test('ClientOnboardingRepository creates contracts, database refs and entitlements for multiple applications', async () => {
  const database = new DatabaseServiceStub();
  const repository = new ClientOnboardingRepository(database as unknown as DatabaseService);
  const dto: CreateClientOnboardingDto = {
    client: {
      clientType: 'company',
      documentType: 'cnpj',
      documentNumber: '12345678000199',
      legalName: 'Cliente Demo',
    },
    applications: [
      { applicationId: '00000000-0000-0000-0000-000000000001', status: 'active', planCode: 'admin' },
      { applicationId: '00000000-0000-0000-0000-000000000002', status: 'active', planCode: 'admin' },
    ],
    admin: {
      documentType: 'cpf',
      documentNumber: '00000000191',
      displayName: 'Operador Senior',
      email: 'operador@jboot.local',
    },
  };

  const result = await repository.create(dto);

  assert.equal(result.applicationContracts.length, 2);
  assert.equal(result.databaseRefs.length, 2);
  assert.equal(result.entitlements.length, 2);
  assert.deepEqual(
    database.queries
      .filter(query => query.sql.includes('INSERT INTO client_applications'))
      .map(query => query.params[1]),
    dto.applications?.map(application => application.applicationId)
  );
  assert.deepEqual(
    database.queries
      .filter(query => query.sql.includes('INSERT INTO entitlements'))
      .map(query => query.params[2]),
    dto.applications?.map(application => application.applicationId)
  );
});

test('admin do cliente nasce pendente e sem senha (convite cria a senha)', async () => {
  const database = new DatabaseServiceStub();
  const repository = new ClientOnboardingRepository(database as unknown as DatabaseService);
  await repository.create({
    client: { clientType: 'company', legalName: 'Cliente Demo' },
    applications: [{ applicationId: '00000000-0000-0000-0000-000000000001' }],
    admin: { documentType: 'cpf', documentNumber: '00000000191', displayName: 'Admin', email: 'admin@cliente.com' }
  } as CreateClientOnboardingDto);
  const identityInsert = database.queries.find(query => query.sql.includes('INSERT INTO identities'));
  assert.match(identityInsert?.sql ?? '', /'pending'/);
  assert.equal(identityInsert?.params[3], 'admin@cliente.com');
  assert.equal(database.queries.some(query => query.sql.includes('INSERT INTO credentials')), false);
});
