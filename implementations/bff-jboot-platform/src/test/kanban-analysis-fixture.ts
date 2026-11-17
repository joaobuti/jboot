import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { flattenLeadCustomer } from '../modules/kanban/leads/lead-fields';
import { OfficeScenario } from './kanban-office-fixture';

/**
 * Apoio de teste da analise do lead e do documento gerado (CRM de leads,
 * Sprint 6) sobre o cenario de escritorios. Dados SINTETICOS (CPF de teste
 * valido, nomes inventados); nenhum documento ou modelo real.
 */

export const ANALYSIS_CPF = '52998224725';

export function syntheticSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return flattenLeadCustomer({
    core: {
      name: 'Cliente Sintetico da Silva',
      documentNumber: ANALYSIS_CPF,
      email: null,
      phone: '41999990000',
      addressZip: '80000000',
      addressStreet: 'Rua Sintetica',
      addressNumber: '10',
      addressComplement: null,
      addressNeighborhood: 'Centro',
      addressCity: 'Curitiba',
      addressState: 'PR',
      ...overrides
    },
    juridico: { dataNascimento: '1960-03-05', nomeMae: 'Mae Sintetica', hipossuficienciaDeclarada: true }
  });
}

/** Lead `enviado` com ciclo de envio e snapshot (como o `LeadsRepository.submit` grava). */
export async function seedSubmittedLead(
  client: Client,
  s: OfficeScenario,
  cardId: string,
  snapshot: Record<string, unknown> = syntheticSnapshot(),
  status = 'enviado'
): Promise<string> {
  const submissionId = randomUUID();
  await client.query(
    `INSERT INTO kanban_lead_submissions
       (id, client_id, card_id, board_id, office_id, customer_id, customer_snapshot, customer_snapshot_sha256,
        documents_snapshot, required_fields, submitted_by_identity_id, submitted_at)
     VALUES ($1, $2, $3, $4, (SELECT office_id FROM kanban_cards WHERE id = $3), $5, $6::jsonb, $7, '[]'::jsonb, ARRAY[]::text[], $8,
             '2026-10-12T13:00:00Z')`,
    [submissionId, s.clientId, cardId, s.boardId, randomUUID(), JSON.stringify(snapshot), 'a'.repeat(64), s.users.memberA]
  );
  await client.query(
    `INSERT INTO kanban_card_leads (card_id, client_id, status, current_submission_id, status_changed_by_identity_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (card_id) DO UPDATE SET status = EXCLUDED.status, current_submission_id = EXCLUDED.current_submission_id`,
    [cardId, s.clientId, status, submissionId, s.users.memberA]
  );
  return submissionId;
}

/** Storage em memoria com a MESMA regra de chave do `StorageService`. */
export function memoryStorage() {
  const objects = new Map<string, Buffer>();
  const deleted: string[] = [];
  const signed: Array<{ key: string; downloadFileName?: string }> = [];
  return {
    objects,
    deleted,
    signed,
    bucketName: 'kanban-card-attachments',
    buildTemplateStorageKey: (p: { clientId: string; templateId: string; versionId: string }) =>
      `${p.clientId}/templates/${p.templateId}/${p.versionId}.docx`,
    buildGeneratedDocumentKey: (p: { clientId: string; cardId: string; documentId: string; format: 'docx' | 'pdf' }) =>
      `${p.clientId}/${p.cardId}/generated/${p.documentId}.${p.format}`,
    upload: async (key: string, body: Buffer) => {
      objects.set(key, Buffer.from(body));
    },
    download: async (key: string) => {
      const body = objects.get(key);
      if (!body) {
        throw Object.assign(new Error('NoSuchKey'), { $metadata: { httpStatusCode: 404 } });
      }
      return Buffer.from(body);
    },
    exists: async (key: string) => objects.has(key),
    deleteQuietly: async (key: string) => {
      deleted.push(key);
      objects.delete(key);
      return true;
    },
    getSignedDownloadUrl: async (key: string, options: { downloadFileName?: string } = {}) => {
      signed.push({ key, downloadFileName: options.downloadFileName });
      return { url: `https://storage.example/${key}`, expiresAt: '2026-10-12T00:05:00.000Z' };
    }
  };
}

export type MemoryStorage = ReturnType<typeof memoryStorage>;

/**
 * Documento APROVADO com `pdf_status = 'pending'` (outbox) e o `.docx` no
 * storage, semeado direto no banco (tipo de caso, modelo, versao, ciclo, caso).
 */
export async function seedApprovedDocument(
  client: Client,
  s: OfficeScenario,
  storage: MemoryStorage,
  docx: Buffer
): Promise<{ documentId: string; submissionId: string; docxKey: string; pdfKey: string }> {
  const submissionId = await seedSubmittedLead(client, s, s.cardA, syntheticSnapshot(), 'aguardando_revisao');
  const templateId = randomUUID();
  const versionId = randomUUID();
  const caseTypeId = randomUUID();
  const caseId = randomUUID();
  const documentId = randomUUID();
  const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
  await client.query(
    `INSERT INTO kanban_document_templates (id, client_id, name, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
    [templateId, s.clientId, `Modelo sintetico ${templateId.slice(0, 8)}`, s.users.admin]
  );
  await client.query(
    `INSERT INTO kanban_document_template_versions
       (id, client_id, template_id, version, storage_bucket, storage_key, file_name, content_type, size_bytes, sha256,
        catalog_version, validation_status, uploaded_by_identity_id)
     VALUES ($1, $2, $3, 1, 'b', $4, 'modelo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 10, $5, 1, 'valid', $6)`,
    [versionId, s.clientId, templateId, `${s.clientId}/templates/${templateId}/${versionId}.docx`, 'b'.repeat(64), s.users.admin]
  );
  await client.query(`INSERT INTO kanban_case_types (id, client_id, name, created_by_identity_id) VALUES ($1, $2, $3, $4)`, [
    caseTypeId,
    s.clientId,
    `Tipo sintetico ${caseTypeId.slice(0, 8)}`,
    s.users.admin
  ]);
  await client.query(
    `INSERT INTO kanban_lead_cases (id, client_id, card_id, submission_id, case_type_id, decided_by_identity_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [caseId, s.clientId, s.cardA, submissionId, caseTypeId, s.users.admin]
  );
  const docxKey = `${s.clientId}/${s.cardA}/generated/${documentId}.docx`;
  await client.query(
    `INSERT INTO kanban_card_generated_documents
       (id, client_id, card_id, submission_id, lead_case_id, version, origin, template_id, template_version_id, template_sha256,
        catalog_version, status, storage_bucket, storage_key, sha256, size_bytes, created_by_identity_id,
        approved_by_identity_id, approved_at, pdf_status, pdf_requested_at)
     VALUES ($1, $2, $3, $4, $5, 1, 'generated', $6, $7, $8, 1, 'aprovado', 'b', $9, $10, $11, $12, $12, now(), 'pending', now() - interval '5 minutes')`,
    [documentId, s.clientId, s.cardA, submissionId, caseId, templateId, versionId, 'b'.repeat(64), docxKey, sha(docx), docx.length, s.users.admin]
  );
  await storage.upload(docxKey, docx);
  return { documentId, submissionId, docxKey, pdfKey: `${s.clientId}/${s.cardA}/generated/${documentId}.pdf` };
}
