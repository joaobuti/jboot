import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(query: PageQuery) {
    return this.database.query(
      `SELECT id, client_type AS "clientType", document_type AS "documentType",
              legal_name AS "legalName", trade_name AS "tradeName", status,
              monthly_fee::float8 AS "monthlyFee",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM clients
       WHERE ($3::text IS NULL OR legal_name ILIKE '%' || $3 || '%' OR trade_name ILIKE '%' || $3 || '%')
       ORDER BY legal_name
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.search ?? null]
    );
  }

  async create(dto: CreateClientDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO clients (client_type, document_type, document_number, legal_name, trade_name, monthly_fee)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, client_type AS "clientType", document_type AS "documentType",
                   legal_name AS "legalName", trade_name AS "tradeName", status,
                   monthly_fee::float8 AS "monthlyFee",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          dto.clientType,
          dto.documentType ?? null,
          dto.documentNumber ?? null,
          dto.legalName,
          dto.tradeName ?? null,
          dto.monthlyFee ?? null
        ]
      )
    );
  }

  async update(id: string, dto: UpdateClientDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE clients
         SET client_type = COALESCE($2, client_type),
             legal_name = COALESCE($3, legal_name),
             trade_name = COALESCE($4, trade_name),
             status = COALESCE($5, status),
             -- null limpa a mensalidade; ausente mantem.
             monthly_fee = CASE WHEN $6::boolean THEN $7::numeric ELSE monthly_fee END,
             updated_at = now()
         WHERE id = $1
         RETURNING id, client_type AS "clientType", document_type AS "documentType",
                   legal_name AS "legalName", trade_name AS "tradeName", status,
                   monthly_fee::float8 AS "monthlyFee",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          id,
          dto.clientType ?? null,
          dto.legalName ?? null,
          dto.tradeName ?? null,
          dto.status ?? null,
          dto.monthlyFee !== undefined,
          dto.monthlyFee ?? null
        ]
      )
    );
  }
}
