import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { markDefaultNoPriorLawsuits } from '../prior-lawsuits/prior-lawsuits.repository';

export interface CardCustomerLinkRow {
  cardId: string;
  customerId: string;
  createdByIdentityId: string;
  createdAt: string;
}

export interface ReplaceCardCustomerResult {
  link: CardCustomerLinkRow;
  previousCustomerId: string | null;
}

const LINK_SELECT = `card_id AS "cardId", customer_id AS "customerId",
                     created_by_identity_id AS "createdByIdentityId", created_at AS "createdAt"`;

/**
 * `kanban_card_customers` (banco do Flow): referencia do card ao cliente final
 * titular do nucleo `establishment-customers`. Nunca le tabela de cliente: o
 * dado do cliente vem do servico exportado daquele modulo.
 */
@Injectable()
export class CardCustomersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByCard(databaseRef: string, clientId: string, cardId: string): Promise<CardCustomerLinkRow | null> {
    const result = await this.database.queryForDatabaseRef<CardCustomerLinkRow>(
      databaseRef,
      `SELECT ${LINK_SELECT} FROM kanban_card_customers WHERE client_id = $1 AND card_id = $2`,
      [clientId, cardId]
    );
    return result.rows[0] ?? null;
  }

  /** Cards nao excluidos vinculados ao cliente (aviso `card.updated` da ficha, R1 de tempo real). */
  async cardIdsByCustomer(databaseRef: string, clientId: string, customerId: string): Promise<string[]> {
    const result = await this.database.queryForDatabaseRef<{ cardId: string }>(
      databaseRef,
      `SELECT cc.card_id AS "cardId" FROM kanban_card_customers cc
       JOIN kanban_cards c ON c.client_id = cc.client_id AND c.id = cc.card_id AND c.status <> 'deleted'
       WHERE cc.client_id = $1 AND cc.customer_id = $2
       LIMIT 50`,
      [clientId, customerId]
    );
    return result.rows.map((row) => row.cardId);
  }

  /**
   * Vincula (ou troca) o titular do card. Trava a linha do card para
   * serializar vinculos concorrentes, substitui a linha (DELETE + INSERT, para
   * `created_at` continuar imutavel) e so aceita card nao excluido do tenant.
   */
  async replace(
    databaseRef: string,
    clientId: string,
    cardId: string,
    customerId: string,
    identityId: string
  ): Promise<ReplaceCardCustomerResult> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const card = await tx.query<{ id: string; officeId: string | null }>(
        `SELECT id, office_id AS "officeId" FROM kanban_cards
         WHERE client_id = $1 AND id = $2 AND status <> 'deleted' FOR UPDATE`,
        [clientId, cardId]
      );
      if (card.rowCount === 0) {
        throw new NotFoundException('Card not found');
      }
      const previous = await tx.query<{ customerId: string }>(
        `DELETE FROM kanban_card_customers WHERE client_id = $1 AND card_id = $2 RETURNING customer_id AS "customerId"`,
        [clientId, cardId]
      );
      const inserted = await tx.query<CardCustomerLinkRow>(
        `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id)
         VALUES ($2, $1, $3, $4)
         RETURNING ${LINK_SELECT}`,
        [clientId, cardId, customerId, identityId]
      );
      // ADR 015: cliente criado/vinculado pelo card herda o escritorio do card.
      // O vinculo e historico; transferencias futuras nunca o apagam.
      if (card.rows[0].officeId) {
        await tx.query(
          `INSERT INTO kanban_customer_offices
             (client_id, customer_id, office_id, source, linked_by_identity_id)
           VALUES ($1,$2,$3,'card',$4)
           ON CONFLICT (client_id, customer_id, office_id) WHERE unlinked_at IS NULL DO NOTHING`,
          [clientId, customerId, card.rows[0].officeId, identityId]
        );
      }
      await markDefaultNoPriorLawsuits(tx, clientId, customerId, identityId);
      return { link: inserted.rows[0], previousCustomerId: previous.rows[0]?.customerId ?? null };
    });
  }

  /**
   * Regra de visibilidade do cliente final (Sprint 1, reescrita na Sprint 3.5):
   * dos ids informados, devolve, na mesma ordem, os vinculados a algum card
   * NAO excluido (arquivado conta) VISIVEL para o usuario (escopo unico:
   * membresia ativa e, com a chave ligada, escritorio; admin com a chave
   * ligada ve todos) ou vinculados por escritorio ativo da ficha a um escritorio
   * do usuario (admin: qualquer), no mesmo tenant. Roda inteiramente no banco do Flow,
   * antes de qualquer leitura de dado do cliente.
   */
  async filterVisibleCustomerIds(
    databaseRef: string,
    clientId: string,
    viewer: KanbanViewer,
    customerIds: string[]
  ): Promise<string[]> {
    if (customerIds.length === 0) {
      return [];
    }
    const scope = visibleCardScope(viewer, 'c', 3);
    const officeParam = 3 + scope.params.length;
    // Tambem visivel: cliente da ficha (ADR 015) vinculado a um escritorio do usuario (admin: qualquer
    // escritorio), mesmo sem card ainda. Mesma regra da tela Clientes (FlowCustomersService).
    const result = await this.database.queryForDatabaseRef<{ customerId: string }>(
      databaseRef,
      `SELECT DISTINCT l.customer_id AS "customerId"
       FROM kanban_card_customers l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1
         AND l.customer_id = ANY($2::uuid[])
         AND c.status <> 'deleted'
         AND ${scope.sql}
       UNION
       SELECT co.customer_id AS "customerId"
       FROM kanban_customer_offices co
       WHERE co.client_id = $1
         AND co.customer_id = ANY($2::uuid[])
         AND co.unlinked_at IS NULL
         AND ($${officeParam}::boolean OR co.office_id = ANY($${officeParam + 1}::uuid[]))`,
      [clientId, customerIds, ...scope.params, viewer.isAdmin, viewer.officeIds]
    );
    const visible = new Set(result.rows.map((row) => row.customerId));
    return customerIds.filter((id) => visible.has(id));
  }

  /**
   * Regra de vinculo entre escritorios (P30): o cliente ja tem card (nao
   * excluido, fora este) e nenhum deles e do escritorio `officeId`? Devolve so
   * booleanos, nunca dado do card; decide se o vinculo amplia o acesso ao
   * cadastro para outro escritorio.
   */
  async isCrossOfficeLink(
    databaseRef: string,
    clientId: string,
    customerId: string,
    officeId: string,
    cardId: string
  ): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef<{ hasCards: boolean; inOffice: boolean }>(
      databaseRef,
      `SELECT count(*) > 0 AS "hasCards", COALESCE(bool_or(c.office_id = $3), false) AS "inOffice"
       FROM kanban_card_customers l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1 AND l.customer_id = $2 AND c.status <> 'deleted' AND c.id <> $4`,
      [clientId, customerId, officeId, cardId]
    );
    const row = result.rows[0];
    return Boolean(row?.hasCards) && !row?.inOffice;
  }
}
