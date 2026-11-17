import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { BrazilUf } from './lawyer.input';

export interface UserLawyerRow {
  identityId: string;
  signatureName: string | null;
  oabs: Array<{ uf: BrazilUf; number: string }>;
}

/** Quem assina a peticao: responsavel do card com OAB na UF da acao. */
export interface PetitionSignerRow {
  identityId: string;
  signatureName: string;
  oabNumber: string;
  oabUf: BrazilUf;
  /** 0 responsavel pelo escritorio do card, 1 `board_admin`, 2 demais. */
  rank: number;
}

/**
 * OABs do usuario do Flow (migration 110; ADR 020, emenda de 2026-10-29, decisao 18). Uma OAB por UF;
 * o cadastro e substituido por inteiro.
 */
@Injectable()
export class UserLawyersRepository {
  constructor(private readonly database: DatabaseService) {}

  async find(databaseRef: string, clientId: string, identityId: string): Promise<UserLawyerRow> {
    const result = await this.database.queryForDatabaseRef<{ signatureName: string; uf: BrazilUf | null; number: string | null }>(
      databaseRef,
      `SELECT p.signature_name AS "signatureName", o.oab_uf AS uf, o.oab_number AS number
       FROM kanban_user_lawyer_profiles p
       LEFT JOIN kanban_user_oabs o ON o.client_id = p.client_id AND o.identity_id = p.identity_id
       WHERE p.client_id = $1 AND p.identity_id = $2
       ORDER BY o.oab_uf`,
      [clientId, identityId]
    );
    return {
      identityId,
      signatureName: result.rows[0]?.signatureName ?? null,
      oabs: result.rows.flatMap((row) => (row.uf && row.number ? [{ uf: row.uf, number: row.number }] : []))
    };
  }

  /** UFs com OAB por usuario do tenant (lista de usuarios). */
  async summary(databaseRef: string, clientId: string): Promise<Array<{ identityId: string; ufs: BrazilUf[] }>> {
    const result = await this.database.queryForDatabaseRef<{ identityId: string; ufs: BrazilUf[] }>(
      databaseRef,
      `SELECT identity_id AS "identityId", array_agg(oab_uf::text ORDER BY oab_uf) AS ufs
       FROM kanban_user_oabs WHERE client_id = $1
       GROUP BY identity_id
       LIMIT 1000`,
      [clientId]
    );
    return result.rows;
  }

  /** Substitui o cadastro; sem OAB, remove o cadastro (o nome so serve para assinar). */
  async replace(
    databaseRef: string,
    clientId: string,
    identityId: string,
    input: { signatureName: string; oabs: Array<{ uf: BrazilUf; number: string }> },
    actorIdentityId: string
  ): Promise<UserLawyerRow> {
    await this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await tx.query(`DELETE FROM kanban_user_oabs WHERE client_id = $1 AND identity_id = $2`, [clientId, identityId]);
      if (input.oabs.length === 0) {
        await tx.query(`DELETE FROM kanban_user_lawyer_profiles WHERE client_id = $1 AND identity_id = $2`, [clientId, identityId]);
        return;
      }
      await tx.query(
        `INSERT INTO kanban_user_lawyer_profiles (client_id, identity_id, signature_name, updated_by_identity_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, identity_id)
         DO UPDATE SET signature_name = EXCLUDED.signature_name, updated_by_identity_id = EXCLUDED.updated_by_identity_id,
                       updated_at = clock_timestamp()`,
        [clientId, identityId, input.signatureName, actorIdentityId]
      );
      for (const oab of input.oabs) {
        await tx.query(
          `INSERT INTO kanban_user_oabs (client_id, identity_id, oab_uf, oab_number) VALUES ($1, $2, $3, $4)`,
          [clientId, identityId, oab.uf, oab.number]
        );
      }
    });
    return this.find(databaseRef, clientId, identityId);
  }

  /**
   * Responsavel do card com OAB na UF, pela hierarquia: responsavel pelo escritorio do card, depois
   * `board_admin` ativo do board, depois os demais; empate pelo mais antigo no card.
   */
  async signerForCard(databaseRef: string, clientId: string, cardId: string, uf: BrazilUf): Promise<PetitionSignerRow | null> {
    const result = await this.database.queryForDatabaseRef<PetitionSignerRow>(
      databaseRef,
      `SELECT a.identity_id AS "identityId", p.signature_name AS "signatureName",
              o.oab_number AS "oabNumber", o.oab_uf AS "oabUf",
              CASE WHEN uo.is_responsible THEN 0 WHEN m.role = 'board_admin' THEN 1 ELSE 2 END AS rank
       FROM kanban_card_assignees a
       JOIN kanban_cards c ON c.client_id = a.client_id AND c.id = a.card_id
       JOIN kanban_user_lawyer_profiles p ON p.client_id = a.client_id AND p.identity_id = a.identity_id
       JOIN kanban_user_oabs o ON o.client_id = p.client_id AND o.identity_id = p.identity_id AND o.oab_uf = $3
       LEFT JOIN kanban_user_offices uo ON uo.client_id = c.client_id AND uo.office_id = c.office_id
         AND uo.identity_id = a.identity_id AND uo.is_responsible
       LEFT JOIN kanban_board_members m ON m.client_id = c.client_id AND m.board_id = c.board_id
         AND m.identity_id = a.identity_id AND m.status = 'active'
       WHERE a.client_id = $1 AND a.card_id = $2
       ORDER BY rank, a.created_at, a.identity_id
       LIMIT 1`,
      [clientId, cardId, uf]
    );
    return result.rows[0] ?? null;
  }
}
