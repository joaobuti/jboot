/**
 * Regra unica de visibilidade de card (CRM de leads, Sprint 3.5; ADR 014,
 * Decisao 6). Funcoes puras: o `CardVisibilityService` e os repositorios usam
 * ESTAS funcoes, nunca reescrevem a regra.
 *
 * Card visivel para U (card do tenant de U, nao excluido):
 * - chave do tenant DESLIGADA: U e membro ativo do quadro do card (regra
 *   anterior, inclusive sem "admin ve tudo");
 * - chave LIGADA e U com `flow:admin`: qualquer quadro do tenant, sem
 *   membresia (P24);
 * - chave LIGADA e U sem `flow:admin`: membro ativo do quadro E o escritorio do
 *   card esta entre os escritorios atuais de U (card sem escritorio so o admin
 *   ve).
 */

/** Scope do admin do tenant no Flow (claim `scopes`/`scope` do JWT Identity). */
export const FLOW_ADMIN_SCOPE = 'flow:admin';

export interface KanbanViewer {
  identityId: string;
  clientId: string;
  /** `flow:admin` no JWT da requisicao (ou no diretorio, fora da requisicao). */
  isAdmin: boolean;
  /** Escritorios atuais do usuario (ativos ou inativos: inativo nao tira a visibilidade). */
  officeIds: string[];
  officeVisibilityEnabled: boolean;
}

export interface CardOfficeRef {
  officeId: string | null;
}

/** Admin com a chave ligada: ve qualquer card do tenant e opera como `board_admin` efetivo. */
export function seesAllCards(viewer: KanbanViewer): boolean {
  // flow:admin ve todo card de todo board, com a visibilidade por escritorio ligada ou nao (regra de 2026-11-11).
  return viewer.isAdmin;
}

/**
 * Versao por card (realtime, notificacao, e-mail, rota com `:cardId`).
 * `isActiveBoardMember` e a membresia ATIVA do usuario no quadro do card.
 */
export function canSeeCard(viewer: KanbanViewer, card: CardOfficeRef, isActiveBoardMember: boolean): boolean {
  if (seesAllCards(viewer)) {
    return true;
  }
  if (!isActiveBoardMember) {
    return false;
  }
  if (!viewer.officeVisibilityEnabled) {
    return true;
  }
  return card.officeId !== null && viewer.officeIds.includes(card.officeId);
}

export interface SqlFragment {
  sql: string;
  params: unknown[];
}

const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/;

/**
 * Fragmento SQL parametrizado UNICO para consultas de conjunto sobre
 * `kanban_cards` (lista, completude, metricas, busca por CPF). `alias` e o
 * alias de `kanban_cards` na consulta (constante do codigo, validada);
 * `firstParam` e o numero do primeiro placeholder livre (`$n`).
 * O `client_id` continua sendo filtrado pela propria consulta.
 */
export function visibleCardScope(viewer: KanbanViewer, alias: string, firstParam: number): SqlFragment {
  if (!SQL_ALIAS.test(alias)) {
    throw new Error(`invalid sql alias: ${alias}`);
  }
  if (!Number.isInteger(firstParam) || firstParam < 1) {
    throw new Error(`invalid first param: ${firstParam}`);
  }
  if (seesAllCards(viewer)) {
    return { sql: 'TRUE', params: [] };
  }
  const membership = `EXISTS (SELECT 1 FROM kanban_board_members vis_m
      WHERE vis_m.client_id = ${alias}.client_id AND vis_m.board_id = ${alias}.board_id
        AND vis_m.identity_id = $${firstParam}::uuid AND vis_m.status = 'active')`;
  if (!viewer.officeVisibilityEnabled) {
    return { sql: `(${membership})`, params: [viewer.identityId] };
  }
  return {
    sql: `(${membership} AND ${alias}.office_id = ANY($${firstParam + 1}::uuid[]))`,
    params: [viewer.identityId, viewer.officeIds]
  };
}
