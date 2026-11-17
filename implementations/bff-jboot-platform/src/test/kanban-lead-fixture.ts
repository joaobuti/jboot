import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { OfficeScenario } from './kanban-office-fixture';

/**
 * Apoio de teste do envio do lead (CRM de leads, Sprint 4) sobre o cenario de
 * escritorios: captacao ligada no quadro, cliente vinculado ao card e tipo de
 * documento obrigatorio. Dados de cliente sao sinteticos (CPF de teste valido).
 */
export const LEAD_CPF = '52998224725';

export interface LeadCustomerStore {
  core: Map<string, Record<string, unknown>>;
  juridico: Map<string, Record<string, unknown>>;
}

export function completeCustomer(id: string): Record<string, unknown> {
  return {
    id,
    name: 'Cliente Sintetico',
    documentNumber: LEAD_CPF,
    email: null,
    phone: null,
    addressZip: '80000000',
    addressStreet: 'Rua Sintetica',
    addressNumber: '10',
    addressComplement: null,
    addressNeighborhood: null,
    addressCity: 'Curitiba',
    addressState: 'PR',
    status: 'active'
  };
}

/** Fakes de `CustomersService`/`CustomerJuridicoService` sobre um store em memoria. */
export function fakeCustomerServices(store: LeadCustomerStore) {
  const customers = {
    findById: async (_clientId: string, id: string) => store.core.get(id) ?? null,
    findIdsByCpf: async (_clientId: string, cpf: string) =>
      [...store.core.values()].filter((row) => row.documentNumber === cpf.replace(/\D/g, '')).map((row) => row.id as string),
    update: async (_clientId: string, id: string, changes: Record<string, unknown>) => {
      store.core.set(id, { ...(store.core.get(id) ?? {}), ...changes });
    }
  };
  const juridico = {
    get: async (_clientId: string, id: string) => store.juridico.get(id) ?? null,
    save: async (_clientId: string, id: string, input: Record<string, unknown>) => {
      store.juridico.set(id, { ...(store.juridico.get(id) ?? {}), ...input });
      return store.juridico.get(id);
    }
  };
  return { customers, juridico };
}

export async function setLeadIntake(client: Client, s: OfficeScenario, enabled: boolean): Promise<void> {
  await client.query(`UPDATE kanban_boards SET lead_intake_enabled = $3 WHERE client_id = $1 AND id = $2`, [s.clientId, s.boardId, enabled]);
}

export async function linkCustomer(client: Client, s: OfficeScenario, cardId: string, customerId: string): Promise<void> {
  await client.query(
    `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
    [cardId, s.clientId, customerId, s.users.memberA]
  );
}

export async function createRequiredDocumentType(client: Client, s: OfficeScenario, name = 'Documento pessoal'): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO kanban_board_document_types (id, client_id, board_id, name, required, sort_order) VALUES ($1, $2, $3, $4, true, 0)`,
    [id, s.clientId, s.boardId, name]
  );
  return id;
}

/** Envio de documento do checklist (activity + anexo + documento), com o estado pedido. */
export async function seedDocument(
  client: Client,
  s: OfficeScenario,
  cardId: string,
  documentTypeId: string,
  status: 'enviado' | 'aceito' | 'rejeitado'
): Promise<string> {
  const activityId = randomUUID();
  const attachmentId = randomUUID();
  const documentId = randomUUID();
  await client.query(
    `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, event_payload)
     VALUES ($1, $2, $3, 'system_event', $4, '{"kind":"card.document_uploaded"}'::jsonb)`,
    [activityId, s.clientId, cardId, s.users.memberA]
  );
  await client.query(
    `INSERT INTO kanban_card_attachments
       (id, client_id, activity_id, file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id)
     VALUES ($1, $2, $3, 'doc.pdf', 'application/pdf', 10, 'b', $4, $5)`,
    [attachmentId, s.clientId, activityId, `${s.clientId}/${cardId}/${activityId}/${attachmentId}`, s.users.memberA]
  );
  await client.query(
    `INSERT INTO kanban_card_documents
       (id, client_id, card_id, document_type_id, attachment_id, status, rejection_reason, reviewed_by_identity_id, reviewed_at, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END, $9)`,
    [
      documentId,
      s.clientId,
      cardId,
      documentTypeId,
      attachmentId,
      status,
      status === 'rejeitado' ? 'ilegivel' : null,
      status === 'enviado' ? null : s.users.boardAdminA,
      s.users.memberA
    ]
  );
  return documentId;
}
