import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateClientApplicationDto, UpdateClientApplicationDto } from './dto/client-application.dto';

@Injectable()
export class ClientApplicationsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(clientId: string, query: PageQuery) {
    return this.database.query(
      `SELECT ca.id, ca.client_id AS "clientId", ca.application_id AS "applicationId",
              a.slug AS "applicationSlug", a.name AS "applicationName",
              ca.status, ca.plan_code AS "planCode", ca.billing_ref AS "billingRef",
              ca.config, ca.starts_at AS "startsAt", ca.ends_at AS "endsAt",
              ca.created_at AS "createdAt", ca.updated_at AS "updatedAt"
       FROM client_applications ca
       JOIN applications a ON a.id = ca.application_id
       WHERE ca.client_id = $1
         AND ($4::text IS NULL OR a.slug ILIKE '%' || $4 || '%' OR a.name ILIKE '%' || $4 || '%')
       ORDER BY a.name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.search ?? null]
    );
  }

  async create(clientId: string, dto: CreateClientApplicationDto) {
    return ensureOne(
      await this.database.query(
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
          dto.applicationId,
          dto.status ?? null,
          dto.planCode ?? null,
          dto.billingRef ?? null,
          JSON.stringify(dto.config ?? {})
        ]
      )
    );
  }

  async update(clientId: string, applicationId: string, dto: UpdateClientApplicationDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE client_applications
         SET status = COALESCE($3, status),
             plan_code = COALESCE($4, plan_code),
             billing_ref = COALESCE($5, billing_ref),
             config = COALESCE($6, config),
             updated_at = now()
         WHERE client_id = $1 AND application_id = $2
         RETURNING id, client_id AS "clientId", application_id AS "applicationId",
                   status, plan_code AS "planCode", billing_ref AS "billingRef",
                   config, starts_at AS "startsAt", ends_at AS "endsAt",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          clientId,
          applicationId,
          dto.status ?? null,
          dto.planCode ?? null,
          dto.billingRef ?? null,
          dto.config ? JSON.stringify(dto.config) : null
        ]
      )
    );
  }
}
