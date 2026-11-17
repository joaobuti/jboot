import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Client } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { buildDocx } from '../../../test/docx-fixture';
import { memoryStorage, MemoryStorage, seedApprovedDocument } from '../../../test/kanban-analysis-fixture';
import { seedOfficeScenario } from '../../../test/kanban-office-fixture';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { documentPdfJobId } from './document-pdf-queue.service';
import { DocumentPdfRepository, MAX_PDF_ATTEMPTS } from './document-pdf.repository';
import { DocumentPdfService, PdfRetryableError } from './document-pdf.service';
import { PdfConversionError } from './pdf-converter.client';

const PDF = Buffer.from('%PDF-1.7\nsintetico');

function build(db: DatabaseService, storage: MemoryStorage, convert: (docx: Buffer) => Promise<Buffer>, clientId: string) {
  const enqueued: string[] = [];
  const conversions: Buffer[] = [];
  const converter = {
    convert: async (docx: Buffer) => {
      conversions.push(docx);
      return convert(docx);
    }
  };
  const queue = { enqueue: async (payload: { documentId: string }) => void enqueued.push(payload.documentId) };
  const tenants = { listActiveFlowTenants: async () => [{ databaseRef: TEST_DATABASE_REF, clientId }] };
  const service = new DocumentPdfService(new DocumentPdfRepository(db), storage as never, converter as never, queue as never, tenants as never);
  return { service, enqueued, conversions };
}

async function pdfRow(client: Client, documentId: string) {
  const result = await client.query<{
    status: string;
    pdfStatus: string;
    attempts: number;
    errorCode: string | null;
    pdfKey: string | null;
    pdfSha: string | null;
    approvedAt: Date | null;
  }>(
    `SELECT status, pdf_status AS "pdfStatus", pdf_attempts AS attempts, pdf_error_code AS "errorCode",
            pdf_storage_key AS "pdfKey", pdf_sha256 AS "pdfSha", approved_at AS "approvedAt"
     FROM kanban_card_generated_documents WHERE id = $1`,
    [documentId]
  );
  return result.rows[0];
}

const payload = (clientId: string, documentId: string) => ({ databaseRef: TEST_DATABASE_REF, clientId, documentId });

void test('PDF: converte o .docx aprovado (sha conferido), grava {id}.pdf e marca done; segunda execucao nao repete', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const storage = memoryStorage();
    const docx = buildDocx({ paragraphs: ['Documento sintetico aprovado'] });
    const seeded = await seedApprovedDocument(client, s, storage, docx);
    const { service, conversions } = build(db, storage, async () => PDF, s.clientId);

    assert.equal(await service.process(payload(s.clientId, seeded.documentId)), 'done');
    assert.deepEqual(conversions[0], docx);
    assert.deepEqual(storage.objects.get(seeded.pdfKey), PDF);
    const row = await pdfRow(client, seeded.documentId);
    assert.equal(row.pdfStatus, 'done');
    assert.equal(row.pdfKey, seeded.pdfKey);
    assert.match(row.pdfSha ?? '', /^[0-9a-f]{64}$/);
    assert.equal(row.attempts, 1);

    assert.equal(await service.process(payload(s.clientId, seeded.documentId)), 'skipped');
    assert.equal(conversions.length, 1);
  }));

void test('PDF: falha transitoria mantem pending e volta ao BullMQ; na 3a tentativa vira failed sem desfazer a aprovacao', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const storage = memoryStorage();
    const seeded = await seedApprovedDocument(client, s, storage, buildDocx());
    const { service } = build(
      db,
      storage,
      async () => {
        throw new PdfConversionError('converter_unavailable', 503);
      },
      s.clientId
    );
    for (let attempt = 1; attempt < MAX_PDF_ATTEMPTS; attempt += 1) {
      await assert.rejects(service.process(payload(s.clientId, seeded.documentId)), PdfRetryableError);
      const row = await pdfRow(client, seeded.documentId);
      assert.equal(row.pdfStatus, 'pending', `tentativa ${attempt}`);
      assert.equal(row.errorCode, 'converter_unavailable');
    }
    assert.equal(await service.process(payload(s.clientId, seeded.documentId)), 'failed');
    const row = await pdfRow(client, seeded.documentId);
    assert.equal(row.pdfStatus, 'failed');
    assert.equal(row.attempts, MAX_PDF_ATTEMPTS);
    // Aprovacao e .docx intactos (criterio da S6).
    assert.equal(row.status, 'aprovado');
    assert.ok(row.approvedAt);
    assert.ok(storage.objects.has(seeded.docxKey));
    assert.equal(storage.objects.has(seeded.pdfKey), false);
  }));

void test('PDF: erro permanente (auth/integridade) vira failed na primeira tentativa', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const storage = memoryStorage();
    const seeded = await seedApprovedDocument(client, s, storage, buildDocx());
    const auth = build(
      db,
      storage,
      async () => {
        throw new PdfConversionError('converter_auth_failed', 401);
      },
      s.clientId
    );
    assert.equal(await auth.service.process(payload(s.clientId, seeded.documentId)), 'failed');
    assert.equal((await pdfRow(client, seeded.documentId)).errorCode, 'converter_auth_failed');

    const other = await seedApprovedDocument(client, { ...s, cardA: s.cardB }, storage, buildDocx());
    storage.objects.set(other.docxKey, buildDocx({ paragraphs: ['conteudo trocado'] }));
    const integrity = build(db, storage, async () => PDF, s.clientId);
    assert.equal(await integrity.service.process(payload(s.clientId, other.documentId)), 'failed');
    assert.equal((await pdfRow(client, other.documentId)).errorCode, 'source_integrity_mismatch');
    assert.equal(integrity.conversions.length, 0);
  }));

void test('PDF: nova tentativa reaproveita o PDF ja gravado (sem segundo arquivo, sem nova conversao)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const storage = memoryStorage();
    const seeded = await seedApprovedDocument(client, s, storage, buildDocx());
    storage.objects.set(seeded.pdfKey, PDF);
    const { service, conversions } = build(db, storage, async () => Buffer.from('%PDF-outro'), s.clientId);
    assert.equal(await service.process(payload(s.clientId, seeded.documentId)), 'done');
    assert.equal(conversions.length, 0);
    assert.deepEqual(storage.objects.get(seeded.pdfKey), PDF);
    assert.equal([...storage.objects.keys()].filter((key) => key.endsWith('.pdf')).length, 1);
  }));

void test('PDF: claim exclusivo (lease) e outro tenant nao converte o documento', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const storage = memoryStorage();
    const seeded = await seedApprovedDocument(client, s, storage, buildDocx());
    const repository = new DocumentPdfRepository(db);
    assert.equal(await repository.claim(TEST_DATABASE_REF, s.otherClientId, seeded.documentId), null);
    assert.ok(await repository.claim(TEST_DATABASE_REF, s.clientId, seeded.documentId));
    // Lease vivo: segunda entrega do mesmo job nao converte em paralelo.
    assert.equal(await repository.claim(TEST_DATABASE_REF, s.clientId, seeded.documentId), null);
  }));

void test('PDF: varredura reenfileira pending antigo sem lease (relay da outbox); jobId estavel por documento', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const storage = memoryStorage();
    const seeded = await seedApprovedDocument(client, s, storage, buildDocx());
    const { service, enqueued } = build(db, storage, async () => PDF, s.clientId);
    assert.equal(await service.sweep(), 1);
    assert.deepEqual(enqueued, [seeded.documentId]);
    assert.equal(documentPdfJobId(seeded.documentId), `pdf-${seeded.documentId}`);
    assert.doesNotMatch(documentPdfJobId(seeded.documentId), /:/);
  }));
