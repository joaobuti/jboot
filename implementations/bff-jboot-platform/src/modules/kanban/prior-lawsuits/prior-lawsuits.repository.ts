import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';

export interface PriorLawsuitRow {
  id: string;
  bank: string;
  processNumber: string;
  createdByIdentityId: string;
  createdAt: string;
  removedAt: string | null;
  removedByIdentityId: string | null;
}

export interface PriorLawsuitDeclarationRow {
  id: string;
  declaredByIdentityId: string;
  declaredAt: string;
  revokedAt: string | null;
  revokedByIdentityId: string | null;
  revokedReason: 'lawsuit_added' | 'withdrawn' | null;
  /** `default`: marcada pelo Flow no cadastro do cliente (migration 111); `manual`: confirmada por uma pessoa. */
  origin: PriorLawsuitDeclarationOrigin;
}

export type PriorLawsuitDeclarationOrigin = 'manual' | 'default';

const LAWSUIT = `id, bank, process_number AS "processNumber", created_by_identity_id AS "createdByIdentityId",
  created_at AS "createdAt", removed_at AS "removedAt", removed_by_identity_id AS "removedByIdentityId"`;
const DECLARATION = `id, declared_by_identity_id AS "declaredByIdentityId", declared_at AS "declaredAt",
  revoked_at AS "revokedAt", revoked_by_identity_id AS "revokedByIdentityId", revoked_reason AS "revokedReason", origin`;

/**
 * Acoes ja ajuizadas e confirmacao "sem acoes anteriores" (migration 102; ADR 020, S2). Escritas
 * serializadas por cliente: incluir acao e confirmar "sem acoes" nao podem cruzar.
 */
@Injectable()
export class PriorLawsuitsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForCustomer(databaseRef: string, clientId: string, customerId: string) {
    const [lawsuits, declarations] = await Promise.all([
      this.database.queryForDatabaseRef<PriorLawsuitRow>(
        databaseRef,
        `SELECT ${LAWSUIT} FROM kanban_customer_prior_lawsuits
         WHERE client_id = $1 AND customer_id = $2 ORDER BY created_at, id LIMIT 500`,
        [clientId, customerId]
      ),
      this.database.queryForDatabaseRef<PriorLawsuitDeclarationRow>(
        databaseRef,
        `SELECT ${DECLARATION} FROM kanban_customer_prior_lawsuit_declarations
         WHERE client_id = $1 AND customer_id = $2 ORDER BY declared_at, id LIMIT 500`,
        [clientId, customerId]
      )
    ]);
    return { lawsuits: lawsuits.rows, declarations: declarations.rows };
  }

  /** Inclui a acao e revoga a confirmacao vigente. `null` = numero ja registrado no cliente. */
  async add(
    databaseRef: string,
    clientId: string,
    customerId: string,
    input: { bank: string; processNumber: string; identityId: string }
  ): Promise<{ lawsuit: PriorLawsuitRow; revokedDeclaration: boolean } | null> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await lockCustomer(tx, clientId, customerId);
      const inserted = await tx.query<PriorLawsuitRow>(
        `INSERT INTO kanban_customer_prior_lawsuits (client_id, customer_id, bank, process_number, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id, customer_id, process_number) WHERE removed_at IS NULL DO NOTHING
         RETURNING ${LAWSUIT}`,
        [clientId, customerId, input.bank, input.processNumber, input.identityId]
      );
      if (!inserted.rows[0]) return null;
      const revoked = await revokeCurrent(tx, clientId, customerId, input.identityId, 'lawsuit_added');
      return { lawsuit: inserted.rows[0], revokedDeclaration: revoked };
    });
  }

  async remove(databaseRef: string, clientId: string, customerId: string, lawsuitId: string, identityId: string) {
    const result = await this.database.queryForDatabaseRef<PriorLawsuitRow>(
      databaseRef,
      `UPDATE kanban_customer_prior_lawsuits
       SET removed_at = clock_timestamp(), removed_by_identity_id = $4
       WHERE client_id = $1 AND customer_id = $2 AND id = $3 AND removed_at IS NULL
       RETURNING ${LAWSUIT}`,
      [clientId, customerId, lawsuitId, identityId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Confirma "sem acoes anteriores". `has_lawsuits` quando ha acao vigente; repetir a confirmacao
   * devolve a existente (`created: false`).
   */
  async declareNone(
    databaseRef: string,
    clientId: string,
    customerId: string,
    identityId: string
  ): Promise<{ outcome: 'has_lawsuits' } | { outcome: 'declared'; created: boolean }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await lockCustomer(tx, clientId, customerId);
      const active = await tx.query(
        `SELECT 1 FROM kanban_customer_prior_lawsuits WHERE client_id = $1 AND customer_id = $2 AND removed_at IS NULL LIMIT 1`,
        [clientId, customerId]
      );
      if ((active.rowCount ?? 0) > 0) return { outcome: 'has_lawsuits' as const };
      const inserted = await tx.query(
        `INSERT INTO kanban_customer_prior_lawsuit_declarations (client_id, customer_id, declared_by_identity_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_id, customer_id) WHERE revoked_at IS NULL DO NOTHING`,
        [clientId, customerId, identityId]
      );
      return { outcome: 'declared' as const, created: (inserted.rowCount ?? 0) > 0 };
    });
  }

  async withdraw(databaseRef: string, clientId: string, customerId: string, identityId: string): Promise<boolean> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await lockCustomer(tx, clientId, customerId);
      return revokeCurrent(tx, clientId, customerId, identityId, 'withdrawn');
    });
  }
}

/**
 * Marcacao padrao "sem acoes anteriores" do cliente que chega ao Flow (migration 111; decisao do usuario
 * de 2026-10-29), na transacao de quem o vincula a escritorio ou card: so quando ninguem mexeu ainda na
 * lista nem na confirmacao. Devolve se marcou.
 */
export async function markDefaultNoPriorLawsuits(tx: PoolClient, clientId: string, customerId: string, identityId: string): Promise<boolean> {
  await lockCustomer(tx, clientId, customerId);
  const inserted = await tx.query(
    `INSERT INTO kanban_customer_prior_lawsuit_declarations (client_id, customer_id, declared_by_identity_id, origin)
     SELECT $1, $2, $3, 'default'
     WHERE NOT EXISTS (SELECT 1 FROM kanban_customer_prior_lawsuits WHERE client_id = $1 AND customer_id = $2)
       AND NOT EXISTS (SELECT 1 FROM kanban_customer_prior_lawsuit_declarations WHERE client_id = $1 AND customer_id = $2)`,
    [clientId, customerId, identityId]
  );
  return (inserted.rowCount ?? 0) > 0;
}

async function lockCustomer(tx: PoolClient, clientId: string, customerId: string) {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext('customer_prior_lawsuits:' || $1 || ':' || $2))`, [clientId, customerId]);
}

async function revokeCurrent(
  tx: PoolClient,
  clientId: string,
  customerId: string,
  identityId: string,
  reason: 'lawsuit_added' | 'withdrawn'
): Promise<boolean> {
  const result = await tx.query(
    `UPDATE kanban_customer_prior_lawsuit_declarations
     SET revoked_at = clock_timestamp(), revoked_by_identity_id = $3, revoked_reason = $4
     WHERE client_id = $1 AND customer_id = $2 AND revoked_at IS NULL`,
    [clientId, customerId, identityId, reason]
  );
  return (result.rowCount ?? 0) > 0;
}
