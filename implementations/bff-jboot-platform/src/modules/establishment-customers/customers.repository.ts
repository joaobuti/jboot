import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { PageQuery, PageResult } from '../pdv/admin/admin.types';
import { ensureOne } from '../pdv/admin/shared/repository-result';
import { CUSTOMER_ADDRESS_FILLABLE_FIELDS, CustomerAddressFillableField, CustomerAddressFillInput } from './customer-address.types';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

const ADDRESS_COLUMNS: Record<CustomerAddressFillableField, string> = {
  addressZip: 'address_zip',
  addressStreet: 'address_street',
  addressNumber: 'address_number',
  addressComplement: 'address_complement',
  addressNeighborhood: 'address_neighborhood',
  addressCity: 'address_city',
  addressState: 'address_state'
};

/** Minimo para o endereco do documento substituir o da ficha. */
const ADDRESS_REQUIRED_FIELDS: CustomerAddressFillableField[] = ['addressStreet', 'addressCity', 'addressState'];

export interface CustomerRow {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressIbgeCode: string | null;
  ie: string | null;
  indIeDest: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

export interface FlowCustomerRow {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

// Nucleo (c) + dado fiscal auxiliar (p = customer_pdv, ADR 013). Sem linha auxiliar,
// ind_ie_dest assume o default 9 (nao contribuinte) e ie/address_ibge_code ficam nulos.
// O codigo NAO le as colunas fiscais legadas do nucleo (congeladas ate a fase de contracao).
const SELECT_COLS = `
  c.id, c.name,
  c.document_number        AS "documentNumber",
  c.email, c.phone,
  c.address_zip            AS "addressZip",
  c.address_street         AS "addressStreet",
  c.address_number         AS "addressNumber",
  c.address_complement     AS "addressComplement",
  c.address_neighborhood   AS "addressNeighborhood",
  c.address_city           AS "addressCity",
  c.address_state          AS "addressState",
  p.address_ibge_code      AS "addressIbgeCode",
  p.ie                     AS "ie",
  COALESCE(p.ind_ie_dest, 9)::smallint AS "indIeDest",
  c.status,
  c.created_at             AS "createdAt",
  c.updated_at             AS "updatedAt"
`;

const FROM_CUSTOMER = `
  FROM pdv_establishment_customers c
  LEFT JOIN customer_pdv p ON p.customer_id = c.id AND p.client_id = c.client_id
`;

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

@Injectable()
export class CustomersRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(clientId: string, query: PageQuery): Promise<PageResult<Omit<CustomerRow, 'total'>>> {
    const result = await this.database.query<CustomerRow>(
      `SELECT ${SELECT_COLS}, count(*) OVER() AS total
       ${FROM_CUSTOMER}
       WHERE c.client_id = $1
         AND ($4::text IS NULL OR c.status = $4)
         AND ($5::text IS NULL OR c.name ILIKE '%' || $5 || '%' OR c.document_number ILIKE '%' || $5 || '%')
       ORDER BY c.name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.status ?? null, query.search ?? null]
    );
    return this.toPage(result.rows, query);
  }

  async findById(clientId: string, id: string): Promise<Omit<CustomerRow, 'total'> | null> {
    return this.selectById(this.database, clientId, id);
  }

  /** Projecao explicita para consumidores Flow; nunca inclui campos fiscais do PDV. */
  async listForFlow(
    clientId: string,
    allowedIds: string[] | null,
    query: { limit: number; offset: number; search?: string }
  ): Promise<PageResult<Omit<FlowCustomerRow, 'total'>>> {
    if (allowedIds?.length === 0) {
      return { data: [], meta: { limit: query.limit, offset: query.offset, total: 0 } };
    }
    const result = await this.database.query<FlowCustomerRow>(
      `SELECT c.id, c.name, c.document_number AS "documentNumber", c.email, c.phone, c.status,
              c.created_at AS "createdAt", c.updated_at AS "updatedAt", count(*) OVER() AS total
       FROM pdv_establishment_customers c
       WHERE c.client_id = $1
         AND ($2::uuid[] IS NULL OR c.id = ANY($2::uuid[]))
         AND ($5::text IS NULL OR c.name ILIKE '%' || $5 || '%'
              OR regexp_replace(COALESCE(c.document_number, ''), '\\D', '', 'g') = regexp_replace($5, '\\D', '', 'g'))
       ORDER BY lower(c.name), c.id
       LIMIT $3 OFFSET $4`,
      [clientId, allowedIds, query.limit, query.offset, query.search ?? null]
    );
    return this.toPage(result.rows, query);
  }

  async findForFlowById(clientId: string, id: string): Promise<Omit<FlowCustomerRow, 'total'> | null> {
    const result = await this.database.query<Omit<FlowCustomerRow, 'total'>>(
      `SELECT c.id, c.name, c.document_number AS "documentNumber", c.email, c.phone, c.status,
              c.created_at AS "createdAt", c.updated_at AS "updatedAt"
       FROM pdv_establishment_customers c WHERE c.client_id = $1 AND c.id = $2`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  async create(clientId: string, dto: CreateCustomerDto) {
    return this.database.transaction(async (tx) => {
      const inserted = ensureOne(
        await tx.query<{ id: string }>(
          `INSERT INTO pdv_establishment_customers (
             client_id, name, document_number, email, phone,
             address_zip, address_street, address_number, address_complement,
             address_neighborhood, address_city, address_state
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9,
             $10, $11, $12
           )
           RETURNING id`,
          [
            clientId,
            dto.name,
            dto.documentNumber ?? null,
            dto.email ?? null,
            dto.phone ?? null,
            dto.addressZip ?? null,
            dto.addressStreet ?? null,
            dto.addressNumber ?? null,
            dto.addressComplement ?? null,
            dto.addressNeighborhood ?? null,
            dto.addressCity ?? null,
            dto.addressState ?? null
          ]
        )
      );
      await this.upsertFiscal(tx, clientId, inserted.id, dto);
      return this.requireById(tx, clientId, inserted.id);
    });
  }

  async update(clientId: string, id: string, dto: UpdateCustomerDto) {
    return this.database.transaction(async (tx) => {
      ensureOne(
        await tx.query<{ id: string }>(
          `UPDATE pdv_establishment_customers
           SET name                = COALESCE($3,          name),
               document_number     = COALESCE($4,          document_number),
               email               = COALESCE($5,          email),
               phone               = COALESCE($6,          phone),
               address_zip         = COALESCE($7,          address_zip),
               address_street      = COALESCE($8,          address_street),
               address_number      = COALESCE($9,          address_number),
               address_complement  = COALESCE($10,         address_complement),
               address_neighborhood= COALESCE($11,         address_neighborhood),
               address_city        = COALESCE($12,         address_city),
               address_state       = COALESCE($13,         address_state),
               status              = COALESCE($14,         status),
               updated_at          = now()
           WHERE client_id = $1 AND id = $2
           RETURNING id`,
          [
            clientId,
            id,
            dto.name ?? null,
            dto.documentNumber ?? null,
            dto.email ?? null,
            dto.phone ?? null,
            dto.addressZip ?? null,
            dto.addressStreet ?? null,
            dto.addressNumber ?? null,
            dto.addressComplement ?? null,
            dto.addressNeighborhood ?? null,
            dto.addressCity ?? null,
            dto.addressState ?? null,
            dto.status ?? null
          ]
        )
      );
      await this.upsertFiscal(tx, clientId, id, dto);
      return this.requireById(tx, clientId, id);
    });
  }

  /**
   * Resolucao de cliente final por telefone OU CPF, sem paginacao/auditoria —
   * usada pelo fluxo publico e anonimo do modulo `comanda` (abertura de
   * sessao via QR de mesa). So considera clientes `active`. Ver
   * modules/comanda/MODULE_CONTRACT.md.
   */
  async findByDocumentOrPhone(
    clientId: string,
    params: { documentNumber?: string | null; phone?: string | null }
  ): Promise<Omit<CustomerRow, 'total'> | null> {
    if (!params.documentNumber && !params.phone) {
      return null;
    }
    const result = await this.database.query<Omit<CustomerRow, 'total'>>(
      `SELECT ${SELECT_COLS}
       ${FROM_CUSTOMER}
       WHERE c.client_id = $1
         AND c.status = 'active'
         AND (
           ($2::text IS NOT NULL AND c.document_number = $2)
           OR ($3::text IS NOT NULL AND c.phone = $3)
         )
       ORDER BY c.created_at
       LIMIT 1`,
      [clientId, params.documentNumber ?? null, params.phone ?? null]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Criacao de cliente final sem contexto de auditoria staff (sem
   * `identityId` — `pdv_audit_events.identity_id` e NOT NULL e nao ha ator
   * humano autenticado nesse fluxo). Usada apenas pela abertura de sessao
   * publica do modulo `comanda`; o CRUD administrativo continua usando
   * `create()` acima, com auditoria.
   */
  async createPublic(
    clientId: string,
    dto: { name: string; documentNumber?: string | null; phone?: string | null }
  ): Promise<Omit<CustomerRow, 'total'>> {
    return this.database.transaction(async (tx) => {
      const inserted = ensureOne(
        await tx.query<{ id: string }>(
          `INSERT INTO pdv_establishment_customers (client_id, name, document_number, phone)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [clientId, dto.name, dto.documentNumber ?? null, dto.phone ?? null]
        )
      );
      return this.requireById(tx, clientId, inserted.id);
    });
  }

  /**
   * Ids de clientes do tenant cujo `document_number`, normalizado so com
   * digitos, e igual ao CPF informado (ja normalizado pelo chamador). Compara
   * tambem valores legados salvos com mascara. Qualquer status. Devolve SO ids,
   * em ordem de criacao: o consumidor (ex.: kanban) decide a visibilidade antes
   * de pedir qualquer dado. Mais de um id indica duplicidade legada (com e sem
   * mascara), registrada como pendencia em docs/product/flow-crm-leads-sprints.md.
   */
  async findIdsByDocumentDigits(clientId: string, digits: string): Promise<string[]> {
    const result = await this.database.query<{ id: string }>(
      `SELECT c.id
       FROM pdv_establishment_customers c
       WHERE c.client_id = $1
         AND c.document_number IS NOT NULL
         AND regexp_replace(c.document_number, '\\D', '', 'g') = $2
       ORDER BY c.created_at, c.id
       LIMIT 10`,
      [clientId, digits]
    );
    return result.rows.map((row) => row.id);
  }

  /**
   * Endereco lido pela IA no comprovante, na validacao do Flow: o documento prevalece e substitui o
   * endereco inteiro da ficha (campo que o documento nao traz fica vazio, nunca mistura dois enderecos).
   * Leitura sem logradouro, cidade e UF nao toca a ficha. Devolve os campos que mudaram.
   */
  async replaceAddressFromDocument(clientId: string, id: string, input: CustomerAddressFillInput): Promise<CustomerAddressFillableField[]> {
    if (!ADDRESS_REQUIRED_FIELDS.every((field) => input[field])) return [];
    const columns = CUSTOMER_ADDRESS_FILLABLE_FIELDS.map((field) => ADDRESS_COLUMNS[field]);
    const result = await this.database.query<Record<string, boolean>>(
      `WITH before AS (
         SELECT ${columns.join(', ')} FROM pdv_establishment_customers WHERE client_id = $1 AND id = $2
       ), saved AS (
         UPDATE pdv_establishment_customers
         SET ${columns.map((column, i) => `${column} = $${i + 3}`).join(', ')}, updated_at = now()
         WHERE client_id = $1 AND id = $2
         RETURNING id
       )
       SELECT ${CUSTOMER_ADDRESS_FILLABLE_FIELDS.map(
         (field, i) => `(SELECT ${columns[i]} FROM before) IS DISTINCT FROM $${i + 3}::text AS "${field}"`
       ).join(', ')}
       FROM saved`,
      [clientId, id, ...CUSTOMER_ADDRESS_FILLABLE_FIELDS.map((field) => input[field] ?? null)]
    );
    const row = result.rows[0];
    return row ? CUSTOMER_ADDRESS_FILLABLE_FIELDS.filter((field) => row[field]) : [];
  }

  /**
   * Compensacao de criacao (ver `CustomersService.discardJustCreated`): apaga o
   * cliente somente se for do `clientId` e nao tiver linha em `customer_pdv`.
   * `customer_juridico` sai por ON DELETE CASCADE. Devolve se apagou.
   */
  async deleteIfNoPdvData(clientId: string, id: string): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `DELETE FROM pdv_establishment_customers c
       WHERE c.client_id = $1
         AND c.id = $2
         AND NOT EXISTS (SELECT 1 FROM customer_pdv p WHERE p.customer_id = c.id)
       RETURNING c.id`,
      [clientId, id]
    );
    return result.rows.length > 0;
  }

  private async selectById(db: Queryable, clientId: string, id: string): Promise<Omit<CustomerRow, 'total'> | null> {
    const result = await db.query<Omit<CustomerRow, 'total'>>(
      `SELECT ${SELECT_COLS} ${FROM_CUSTOMER} WHERE c.client_id = $1 AND c.id = $2`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  private async requireById(db: Queryable, clientId: string, id: string): Promise<Omit<CustomerRow, 'total'>> {
    const row = await this.selectById(db, clientId, id);
    if (!row) {
      throw new NotFoundException('Resource not found');
    }
    return row;
  }

  /**
   * Upsert de customer_pdv na mesma transacao do nucleo. So grava quando algum
   * campo fiscal foi informado; campos ausentes/nulos preservam o valor atual
   * (mesma semantica COALESCE do PATCH anterior).
   */
  private async upsertFiscal(
    tx: Queryable,
    clientId: string,
    customerId: string,
    dto: { ie?: string | null; indIeDest?: string | null; addressIbgeCode?: string | null }
  ): Promise<void> {
    if (dto.ie == null && dto.indIeDest == null && dto.addressIbgeCode == null) {
      return;
    }
    await tx.query(
      `INSERT INTO customer_pdv (customer_id, client_id, ie, ind_ie_dest, address_ibge_code)
       VALUES ($1, $2, $3, COALESCE($4::smallint, 9), $5)
       ON CONFLICT (customer_id) DO UPDATE
       SET ie                = COALESCE($3,           customer_pdv.ie),
           ind_ie_dest       = COALESCE($4::smallint, customer_pdv.ind_ie_dest),
           address_ibge_code = COALESCE($5,           customer_pdv.address_ibge_code),
           updated_at        = now()
       WHERE customer_pdv.client_id = $2`,
      [customerId, clientId, dto.ie ?? null, dto.indIeDest ?? null, dto.addressIbgeCode ?? null]
    );
  }

  private toPage<T extends { total?: string }>(rows: T[], query: PageQuery): PageResult<Omit<T, 'total'>> {
    const total = rows[0]?.total ? Number(rows[0].total) : 0;
    return {
      data: rows.map((row) => {
        const { total: _ignored, ...data } = row;
        void _ignored;
        return data;
      }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }
}
