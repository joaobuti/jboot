import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { CreateClientOnboardingDto } from './dto/client-onboarding.dto';
import { expectedDatabaseRef } from '../shared/database-ref-rule';
import { loadAdminBundle } from '../shared/admin-bundle';

interface ApplicationDatabaseRow extends QueryResultRow {
  id: string;
  database_id?: string;
  isolation_strategy: string;
  connection_name?: string;
  default_database_name?: string;
}

@Injectable()
export class ClientOnboardingRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Admin nasce `pending` e sem senha: cria a senha pelo convite (account-access-email-sprints.md, S2). */
  create(dto: CreateClientOnboardingDto) {
    return this.database.transaction(async client => {
      const applications = this.onboardingApplications(dto);
      if (applications.length === 0) {
        throw new UnprocessableEntityException('At least one application is required');
      }

      const applicationDatabases = await Promise.all(
        applications.map(application => this.findPrimaryApplicationDatabase(client, application.applicationId))
      );
      const clientRow = await this.createClient(client, dto);
      const identityRow = await this.createIdentity(client, dto);
      const membershipRow = await this.createMembership(client, identityRow.id, clientRow.id);
      const applicationContracts = [];
      const databaseRefs = [];
      const entitlements = [];

      for (const [index, application] of applications.entries()) {
        applicationContracts.push(await this.createClientApplication(client, clientRow.id, application));
        databaseRefs.push(await this.createDatabaseRef(
          client,
          clientRow.id,
          application.applicationId,
          applicationDatabases[index]
        ));
        entitlements.push(await this.createEntitlement(
          client,
          identityRow.id,
          clientRow.id,
          application.applicationId,
          dto
        ));
      }

      return {
        client: clientRow,
        applicationContract: applicationContracts[0],
        applicationContracts,
        adminIdentity: identityRow,
        membership: membershipRow,
        entitlement: entitlements[0],
        entitlements,
        databaseRef: databaseRefs[0],
        databaseRefs
      };
    });
  }

  private onboardingApplications(dto: CreateClientOnboardingDto) {
    const applications = dto.applications?.length ? dto.applications : dto.application ? [dto.application] : [];
    return applications.filter((application, index, all) =>
      all.findIndex(item => item.applicationId === application.applicationId) === index
    );
  }

  private async findPrimaryApplicationDatabase(client: PoolClient, applicationId: string) {
    const result = await client.query<ApplicationDatabaseRow>(
      `SELECT ad.id, ad.database_id, ad.isolation_strategy,
              d.connection_name, d.default_database_name
       FROM application_databases ad
       LEFT JOIN databases d ON d.id = ad.database_id
       WHERE ad.application_id = $1
         AND ad.role = 'primary'
         AND ad.status = 'active'`,
      [applicationId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new UnprocessableEntityException('Application primary database rule is required');
    }
    return row;
  }

  private async createClient(client: PoolClient, dto: CreateClientOnboardingDto) {
    const result = await client.query(
      `INSERT INTO clients (client_type, document_type, document_number, legal_name, trade_name, monthly_fee)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, client_type AS "clientType", document_type AS "documentType",
                 legal_name AS "legalName", trade_name AS "tradeName", status,
                 monthly_fee::float8 AS "monthlyFee",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        dto.client.clientType,
        dto.client.documentType ?? null,
        dto.client.documentNumber ?? null,
        dto.client.legalName,
        dto.client.tradeName ?? null,
        dto.client.monthlyFee ?? null
      ]
    );
    return result.rows[0];
  }

  private async createIdentity(client: PoolClient, dto: CreateClientOnboardingDto) {
    const result = await client.query(
      `INSERT INTO identities (document_type, document_number, display_name, email, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, document_type AS "documentType", display_name AS "displayName",
                 email, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        dto.admin.documentType,
        dto.admin.documentNumber,
        dto.admin.displayName,
        dto.admin.email
      ]
    );
    return result.rows[0];
  }

  private async createClientApplication(
    client: PoolClient,
    clientId: string,
    application: NonNullable<CreateClientOnboardingDto['applications']>[number]
  ) {
    const result = await client.query(
      `INSERT INTO client_applications (
         client_id, application_id, status, plan_code, billing_ref, config
       )
       VALUES ($1, $2, COALESCE($3, 'active'), $4, $5, $6)
       RETURNING id, client_id AS "clientId", application_id AS "applicationId",
                 status, plan_code AS "planCode", billing_ref AS "billingRef",
                 config, starts_at AS "startsAt", ends_at AS "endsAt",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        clientId,
        application.applicationId,
        application.status ?? null,
        application.planCode ?? null,
        application.billingRef ?? null,
        JSON.stringify(application.config ?? {})
      ]
    );
    return result.rows[0];
  }

  private async createDatabaseRef(
    client: PoolClient,
    clientId: string,
    applicationId: string,
    appDb: ApplicationDatabaseRow
  ) {
    const expected = expectedDatabaseRef(appDb, applicationId, clientId);
    if (!expected) {
      return null;
    }
    const result = await client.query(
      `INSERT INTO database_refs (
         application_id, client_id, database_id, strategy, connection_name, database_name, schema_name, status, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, application_id AS "applicationId", client_id AS "clientId", database_id AS "databaseId",
                 strategy, connection_name AS "connectionName", database_name AS "databaseName",
                 schema_name AS "schemaName", status, metadata, created_at AS "createdAt"`,
      [
        applicationId,
        clientId,
        expected.databaseId,
        expected.strategy,
        expected.connectionName,
        expected.databaseName,
        expected.schemaName,
        expected.status,
        JSON.stringify(expected.metadata)
      ]
    );
    return result.rows[0];
  }

  private async createMembership(client: PoolClient, identityId: string, clientId: string) {
    const result = await client.query(
      `INSERT INTO memberships (identity_id, client_id, roles)
       VALUES ($1, $2, $3)
       RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                 roles, status, created_at AS "createdAt"`,
      [identityId, clientId, ['client_admin']]
    );
    return result.rows[0];
  }

  private async createEntitlement(
    client: PoolClient,
    identityId: string,
    clientId: string,
    applicationId: string,
    dto: CreateClientOnboardingDto
  ) {
    // Pacote de admin do modulo no catalogo (migration 133); `adminScopes/adminRoles` do pedido, se vierem, prevalecem.
    const bundle = await loadAdminBundle(client, applicationId);
    const result = await client.query(
      `INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                 application_id AS "applicationId", scopes, roles, status,
                 created_at AS "createdAt"`,
      [
        identityId,
        clientId,
        applicationId,
        dto.adminScopes ?? bundle.scopes,
        dto.adminRoles ?? [...new Set(['client_admin', ...bundle.roles])]
      ]
    );
    return result.rows[0];
  }
}
