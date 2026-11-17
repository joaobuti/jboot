import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CustomerJuridico, CustomerJuridicoFillInput, CustomerJuridicoInput } from './customer-juridico.types';

// Mapa campo do servico -> coluna. Whitelist: so estas colunas entram em SQL dinamico.
const FIELD_COLUMNS: Record<keyof CustomerJuridicoInput, string> = {
  dataNascimento: 'data_nascimento',
  nacionalidade: 'nacionalidade',
  estadoCivil: 'estado_civil',
  profissao: 'profissao',
  rgNumero: 'rg_numero',
  rgOrgaoEmissor: 'rg_orgao_emissor',
  rgUf: 'rg_uf',
  nomeMae: 'nome_mae',
  numeroBeneficio: 'numero_beneficio',
  especieBeneficio: 'especie_beneficio',
  bancoPagamento: 'banco_pagamento',
  hipossuficienciaDeclarada: 'hipossuficiencia_declarada',
  observacoes: 'observacoes'
};

const SELECT_COLS = `
  j.customer_id                  AS "customerId",
  to_char(j.data_nascimento, 'YYYY-MM-DD') AS "dataNascimento",
  j.nacionalidade                AS "nacionalidade",
  j.estado_civil                 AS "estadoCivil",
  j.profissao                    AS "profissao",
  j.rg_numero                    AS "rgNumero",
  j.rg_orgao_emissor             AS "rgOrgaoEmissor",
  j.rg_uf                        AS "rgUf",
  j.nome_mae                     AS "nomeMae",
  j.numero_beneficio             AS "numeroBeneficio",
  j.especie_beneficio            AS "especieBeneficio",
  j.banco_pagamento              AS "bancoPagamento",
  j.hipossuficiencia_declarada   AS "hipossuficienciaDeclarada",
  j.observacoes                  AS "observacoes",
  j.created_at                   AS "createdAt",
  j.updated_at                   AS "updatedAt"
`;

@Injectable()
export class CustomerJuridicoRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByCustomerId(clientId: string, customerId: string): Promise<CustomerJuridico | null> {
    const result = await this.database.query<CustomerJuridico>(
      `SELECT ${SELECT_COLS}
       FROM customer_juridico j
       JOIN pdv_establishment_customers c ON c.id = j.customer_id AND c.client_id = j.client_id
       WHERE j.client_id = $1 AND j.customer_id = $2`,
      [clientId, customerId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Upsert parcial. O INSERT parte de SELECT no nucleo filtrado por client_id:
   * customer de outro tenant (ou inexistente) nao gera linha e resulta em 404.
   */
  async upsert(clientId: string, customerId: string, input: CustomerJuridicoInput): Promise<CustomerJuridico> {
    const fields = (Object.keys(FIELD_COLUMNS) as Array<keyof CustomerJuridicoInput>).filter(
      (field) => input[field] !== undefined
    );
    const columns = fields.map((field) => FIELD_COLUMNS[field]);
    const values = fields.map((field) => input[field]);
    const insertCols = ['customer_id', 'client_id', ...columns].join(', ');
    const selectParams = ['c.id', 'c.client_id', ...values.map((_, i) => `$${i + 3}`)].join(', ');
    const updateSet = [...columns.map((col) => `${col} = EXCLUDED.${col}`), 'updated_at = now()'].join(', ');

    const result = await this.database.query<{ customerId: string }>(
      `INSERT INTO customer_juridico (${insertCols})
       SELECT ${selectParams}
       FROM pdv_establishment_customers c
       WHERE c.client_id = $1 AND c.id = $2
       ON CONFLICT (customer_id) DO UPDATE SET ${updateSet}
       WHERE customer_juridico.client_id = EXCLUDED.client_id
       RETURNING customer_id AS "customerId"`,
      [clientId, customerId, ...values]
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Resource not found');
    }
    const saved = await this.findByCustomerId(clientId, customerId);
    if (!saved) {
      throw new NotFoundException('Resource not found');
    }
    return saved;
  }

  /**
   * Preenche so os campos vazios (a ficha sempre prevalece) numa unica instrucao: o
   * UPDATE usa COALESCE com o valor gravado, entao valor digitado nunca e sobrescrito.
   * Devolve os campos que estavam vazios antes e receberam o valor.
   */
  async fillEmpty(clientId: string, customerId: string, input: CustomerJuridicoFillInput): Promise<Array<keyof CustomerJuridicoFillInput>> {
    const fields = (Object.keys(input) as Array<keyof CustomerJuridicoFillInput>).filter(
      (field) => field in FIELD_COLUMNS && typeof input[field] === 'string' && input[field] !== ''
    );
    if (fields.length === 0) return [];
    const columns = fields.map((field) => FIELD_COLUMNS[field]);
    const values = fields.map((field) => input[field]);
    const params = fields.map((field, i) => (field === 'dataNascimento' ? `$${i + 3}::date` : `$${i + 3}::text`));
    const keep = (col: string) =>
      col === 'data_nascimento'
        ? `COALESCE(customer_juridico.${col}, EXCLUDED.${col})`
        : `COALESCE(NULLIF(btrim(customer_juridico.${col}), ''), EXCLUDED.${col})`;
    const wasEmpty = (col: string) =>
      col === 'data_nascimento' ? `(SELECT ${col} FROM before) IS NULL` : `NULLIF(btrim((SELECT ${col} FROM before)), '') IS NULL`;

    const result = await this.database.query<Record<string, unknown> & { saved: boolean }>(
      `WITH before AS (
         SELECT ${columns.join(', ')} FROM customer_juridico WHERE client_id = $1 AND customer_id = $2
       ), saved AS (
         INSERT INTO customer_juridico (customer_id, client_id, ${columns.join(', ')})
         SELECT c.id, c.client_id, ${params.join(', ')}
         FROM pdv_establishment_customers c
         WHERE c.client_id = $1 AND c.id = $2
         ON CONFLICT (customer_id) DO UPDATE SET ${columns.map((col) => `${col} = ${keep(col)}`).join(', ')}, updated_at = now()
         WHERE customer_juridico.client_id = EXCLUDED.client_id
         RETURNING customer_id
       )
       SELECT EXISTS (SELECT 1 FROM saved) AS saved, ${fields.map((field, i) => `${wasEmpty(columns[i])} AS "${field}"`).join(', ')}`,
      [clientId, customerId, ...values]
    );
    const row = result.rows[0];
    if (!row?.saved) {
      throw new NotFoundException('Resource not found');
    }
    return fields.filter((field) => row[field] === true);
  }
}
