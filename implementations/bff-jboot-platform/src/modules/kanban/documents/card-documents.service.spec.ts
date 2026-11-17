import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffVisibility, noLeadLock } from '../../../test/kanban-visibility';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PublishPlatformNotificationInput } from '../../notifications/notifications.types';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildChecklist, CardDocumentsService } from './card-documents.service';
import { CardDocumentResponse } from './dto/card-document.dto';

const context = {
  clientId: 'client-1',
  identityId: 'operator-1',
  databaseRef: 'db-1',
  applicationId: 'app-1',
  roles: [],
  scopes: []
};
const reviewerContext = { ...context, identityId: 'reviewer-1' };
const mutate = { ...context, userAgent: 'test', ip: '127.0.0.1' };

const CARD = { id: 'card-1', boardId: 'board-1', boardColumnId: 'column-1', createdByIdentityId: 'creator-1' };
const TYPE = { id: 'type-1', boardId: 'board-1', name: 'Procuracao', required: true, sortOrder: 0, active: true };
const PDF = { originalname: 'RG Fulano.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.7\n', 'latin1') };

function documentRow(overrides: Partial<CardDocumentResponse> = {}): CardDocumentResponse {
  return {
    id: 'doc-1',
    cardId: 'card-1',
    documentTypeId: 'type-1',
    status: 'enviado',
    rejectionReason: null,
    reviewedByIdentityId: null,
    reviewedAt: null,
    createdByIdentityId: 'operator-1',
    createdAt: '2026-10-10T10:00:00Z',
    attachment: { id: 'att-1', activityId: 'act-1', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 },
    ...overrides
  };
}

interface Calls {
  uploads: string[];
  deletes: string[];
  createUploads: unknown[];
  reviews: Array<{ status: string; rejectionReason: string | null; eventPayload: Record<string, unknown> }>;
  published: PublishPlatformNotificationInput[];
  audits: string[];
}

function build(overrides: Record<string, unknown> = {}) {
  const calls: Calls = { uploads: [], deletes: [], createUploads: [], reviews: [], published: [], audits: [] };
  const documents = {
    listForCard: async () => [],
    findById: async () => documentRow(),
    findLatestIdForType: async () => 'doc-1',
    createUpload: async (_ref: string, _client: string, input: { documentId: string }) => {
      calls.createUploads.push(input);
      return documentRow({ id: input.documentId });
    },
    review: async (
      _ref: string,
      _client: string,
      params: { status: 'aceito' | 'rejeitado'; rejectionReason: string | null; eventPayload: Record<string, unknown> }
    ) => {
      calls.reviews.push(params);
      return { document: documentRow({ status: params.status, rejectionReason: params.rejectionReason }), activityId: 'act-r' };
    }
  };
  const documentTypes = { list: async () => [TYPE], findById: async () => TYPE };
  const cards = { findById: async () => CARD };
  const assignees = { list: async () => [{ identityId: 'assignee-1' }, { identityId: 'reviewer-1' }, { identityId: 'creator-1' }] };
  const storage = {
    bucketName: 'kanban-card-attachments',
    buildStorageKey: (p: { clientId: string; cardId: string; activityId: string; attachmentId: string }) =>
      `${p.clientId}/${p.cardId}/${p.activityId}/${p.attachmentId}-file`,
    upload: async (key: string) => {
      calls.uploads.push(key);
    },
    deleteQuietly: async (key: string) => {
      calls.deletes.push(key);
      return true;
    }
  };
  const access = {
    requireBoard: async () => ({ id: 'board-1' }),
    requireMember: async () => ({ role: 'board_member', profileId: null }),
    requireRole: async () => 'board_member',
    requireColumnEditable: async () => undefined,
    canReviewDocuments: async () => true,
    requireCanReviewDocuments: async () => undefined
  };
  const audit = {
    record: async (eventType: string) => {
      calls.audits.push(eventType);
    }
  };
  const notifications = new NotificationsService(
    {
      publish: async (input: PublishPlatformNotificationInput) => {
        calls.published.push(input);
      }
    } as never,
    keyOffVisibility(async () => ({}))
  );
  const columns = {
    findById: async () => ({ id: 'column-1', boardId: 'board-1', requiresCompleteChecklist: false, status: 'active' })
  };
  const deps = { documents, documentTypes, cards, assignees, storage, access, audit, notifications, columns, ...overrides };
  const service = new CardDocumentsService(
    deps.documents as never,
    deps.documentTypes as never,
    keyOffVisibility((boardId, cardId) =>
      (deps.cards as { findById: (...args: unknown[]) => Promise<unknown> }).findById('db-1', 'client-1', boardId, cardId)
    ),
    deps.assignees as never,
    deps.storage as never,
    deps.access as never,
    deps.audit as never,
    deps.notifications as never,
    deps.columns as never,
    noLeadLock
  );
  return { service, calls };
}

// ---------------- upload ----------------

void test('upload: grava activity + attachment + documento depois de subir o objeto', async () => {
  const { service, calls } = build();
  const document = await service.upload(context as never, 'board-1', 'card-1', 'type-1', PDF, mutate as never);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.createUploads.length, 1);
  const input = calls.createUploads[0] as { storageKey: string; cardId: string; documentTypeId: string; activityId: string };
  assert.equal(input.storageKey, calls.uploads[0]);
  assert.ok(input.storageKey.startsWith('client-1/card-1/'), 'chave prefixada por tenant/card');
  assert.equal(input.cardId, 'card-1');
  assert.equal(input.documentTypeId, 'type-1');
  assert.equal(document.status, 'enviado');
  assert.deepEqual(calls.audits, ['kanban_card_document_uploaded']);
  assert.deepEqual(calls.deletes, []);
});

void test('upload: tipo de arquivo fora da whitelist dos anexos -> 415, nada sobe', async () => {
  const { service, calls } = build();
  await assert.rejects(
    service.upload(context as never, 'board-1', 'card-1', 'type-1', { ...PDF, mimetype: 'application/x-msdownload' }, mutate as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 415 && error.getResponse().code === 'content_type_not_allowed'
  );
  assert.equal(calls.uploads.length, 0);
});

void test('upload: conteudo que nao condiz com o tipo declarado (HTML como PDF) -> 415 sem nome do arquivo, nada sobe', async () => {
  const { service, calls } = build();
  const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>', 'utf8');
  await assert.rejects(
    service.upload(context as never, 'board-1', 'card-1', 'type-1', { ...PDF, buffer: html, size: html.length }, mutate as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 415 &&
      error.getResponse().code === 'content_signature_mismatch' &&
      !JSON.stringify(error.getResponse()).includes('Fulano')
  );
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.createUploads.length, 0);
});

void test('upload: arquivo acima do limite dos anexos -> 413, nada sobe', async () => {
  const { service, calls } = build();
  await assert.rejects(
    service.upload(context as never, 'board-1', 'card-1', 'type-1', { ...PDF, size: MAX_ATTACHMENT_SIZE_BYTES + 1 }, mutate as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 413 && error.getResponse().code === 'file_too_large'
  );
  await assert.rejects(
    service.upload(context as never, 'board-1', 'card-1', 'type-1', undefined, mutate as never),
    (error: { getStatus: () => number }) => error.getStatus() === 400
  );
  assert.equal(calls.uploads.length, 0);
});

void test('upload: falha do storage nao grava linha nenhuma', async () => {
  const { service, calls } = build({
    storage: {
      bucketName: 'b',
      buildStorageKey: () => 'k',
      upload: async () => {
        throw new Error('minio down');
      },
      deleteQuietly: async () => true
    }
  });
  await assert.rejects(service.upload(context as never, 'board-1', 'card-1', 'type-1', PDF, mutate as never), /minio down/);
  assert.equal(calls.createUploads.length, 0);
  assert.deepEqual(calls.audits, []);
});

void test('upload: falha da transacao depois do envio remove o objeto e propaga o erro', async () => {
  const { service, calls } = build({
    documents: {
      createUpload: async () => {
        throw new Error('db down');
      }
    }
  });
  await assert.rejects(service.upload(context as never, 'board-1', 'card-1', 'type-1', PDF, mutate as never), /db down/);
  assert.equal(calls.uploads.length, 1);
  assert.deepEqual(calls.deletes, calls.uploads);
  assert.deepEqual(calls.audits, []);
});

void test('upload: tipo inativo -> 422; tipo de outro quadro/tenant -> 404', async () => {
  const inactive = build({ documentTypes: { findById: async () => ({ ...TYPE, active: false }) } });
  await assert.rejects(
    inactive.service.upload(context as never, 'board-1', 'card-1', 'type-1', PDF, mutate as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 422 && error.getResponse().code === 'document_type_inactive'
  );
  const missing = build({ documentTypes: { findById: async () => null } });
  await assert.rejects(
    missing.service.upload(context as never, 'board-1', 'card-1', 'type-x', PDF, mutate as never),
    NotFoundException
  );
  assert.equal(inactive.calls.uploads.length + missing.calls.uploads.length, 0);
});

void test('upload: mesma regra das mutacoes de card (coluna nao editavel) -> 403 antes de subir', async () => {
  const { service, calls } = build({
    access: {
      requireBoard: async () => ({}),
      requireRole: async () => 'board_member',
      requireColumnEditable: async () => {
        throw new ForbiddenException({ code: 'column_not_editable' });
      }
    }
  });
  await assert.rejects(service.upload(context as never, 'board-1', 'card-1', 'type-1', PDF, mutate as never), ForbiddenException);
  assert.equal(calls.uploads.length, 0);
});

void test('upload: card de outro quadro/tenant ou excluido -> 404, nada sobe', async () => {
  const { service, calls } = build({ cards: { findById: async () => null } });
  await assert.rejects(service.upload(context as never, 'board-1', 'card-x', 'type-1', PDF, mutate as never), NotFoundException);
  assert.equal(calls.uploads.length, 0);
});

// ---------------- revisao ----------------

void test('revisao: sem permissao de revisor -> 403 estruturado e nada muda', async () => {
  const { service, calls } = build({
    access: {
      requireBoard: async () => ({}),
      requireCanReviewDocuments: async () => {
        throw new ForbiddenException({ code: 'cannot_review_documents' });
      }
    }
  });
  await assert.rejects(
    service.review(context as never, 'board-1', 'card-1', 'doc-1', { status: 'aceito' }, mutate as never),
    ForbiddenException
  );
  assert.equal(calls.reviews.length, 0);
});

void test('revisao: outro tenant (quadro invisivel) -> 404 antes de qualquer leitura', async () => {
  const { service, calls } = build({
    access: {
      requireBoard: async () => {
        throw new NotFoundException('Board not found');
      }
    }
  });
  await assert.rejects(
    service.review(context as never, 'board-1', 'card-1', 'doc-1', { status: 'aceito' }, mutate as never),
    NotFoundException
  );
  assert.equal(calls.reviews.length, 0);
});

void test('revisao: aceite grava evento so com ids/tipo e nao notifica', async () => {
  const { service, calls } = build();
  const result = await service.review(reviewerContext as never, 'board-1', 'card-1', 'doc-1', { status: 'aceito' }, mutate as never);
  assert.equal(result.status, 'aceito');
  assert.equal(calls.reviews.length, 1);
  assert.equal(calls.reviews[0].rejectionReason, null);
  assert.deepEqual(calls.reviews[0].eventPayload, { documentId: 'doc-1', documentTypeId: 'type-1', documentTypeName: 'Procuracao' });
  assert.deepEqual(calls.published, []);
  assert.deepEqual(calls.audits, ['kanban_card_document_accepted']);
});

void test('revisao: rejeicao exige motivo', async () => {
  const { service, calls } = build();
  await assert.rejects(
    service.review(reviewerContext as never, 'board-1', 'card-1', 'doc-1', { status: 'rejeitado', rejectionReason: '   ' }, mutate as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 400 && error.getResponse().code === 'rejection_reason_required'
  );
  assert.equal(calls.reviews.length, 0);
});

void test('revisao: rejeicao notifica responsaveis e criador (sem duplicar), nunca o proprio revisor', async () => {
  const { service, calls } = build();
  await service.review(
    reviewerContext as never,
    'board-1',
    'card-1',
    'doc-1',
    { status: 'rejeitado', rejectionReason: 'Ilegivel' },
    mutate as never
  );
  assert.deepEqual(calls.reviews[0].eventPayload, {
    documentId: 'doc-1',
    documentTypeId: 'type-1',
    documentTypeName: 'Procuracao',
    rejectionReason: 'Ilegivel'
  });
  const recipients = calls.published.map((item) => item.recipientIdentityId).sort();
  assert.deepEqual(recipients, ['assignee-1', 'creator-1']);
  for (const item of calls.published) {
    assert.equal(item.kind, 'kanban.card.document_rejected');
    assert.equal(item.actorIdentityId, 'reviewer-1');
    assert.equal(item.actionUrl, '/flow/boards/board-1?card=card-1');
    assert.deepEqual(Object.keys(item.payload ?? {}).sort(), ['boardId', 'cardId', 'documentId', 'documentTypeId', 'documentTypeName']);
  }
});

void test('revisao: falha da notificacao nao desfaz a rejeicao', async () => {
  const { service, calls } = build({
    assignees: {
      list: async () => {
        throw new Error('db down');
      }
    }
  });
  const result = await service.review(
    reviewerContext as never,
    'board-1',
    'card-1',
    'doc-1',
    { status: 'rejeitado', rejectionReason: 'Vencido' },
    mutate as never
  );
  assert.equal(result.status, 'rejeitado');
  assert.equal(calls.reviews.length, 1);
});

void test('revisao: so sobre status enviado e sobre o envio mais recente do item', async () => {
  const accepted = build({ documents: { findById: async () => documentRow({ status: 'aceito' }) } });
  await assert.rejects(
    accepted.service.review(reviewerContext as never, 'board-1', 'card-1', 'doc-1', { status: 'aceito' }, mutate as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 409 && error.getResponse().code === 'document_not_pending'
  );
  const superseded = build({ documents: { findById: async () => documentRow(), findLatestIdForType: async () => 'doc-2' } });
  await assert.rejects(
    superseded.service.review(reviewerContext as never, 'board-1', 'card-1', 'doc-1', { status: 'aceito' }, mutate as never),
    (error: { getResponse: () => { code: string } }) => error.getResponse().code === 'document_superseded'
  );
  const race = build({
    documents: { findById: async () => documentRow(), findLatestIdForType: async () => 'doc-1', review: async () => null }
  });
  await assert.rejects(
    race.service.review(reviewerContext as never, 'board-1', 'card-1', 'doc-1', { status: 'aceito' }, mutate as never),
    (error: { getResponse: () => { code: string } }) => error.getResponse().code === 'document_not_pending'
  );
  const otherCard = build({ documents: { findById: async () => null } });
  await assert.rejects(
    otherCard.service.review(reviewerContext as never, 'board-1', 'card-2', 'doc-1', { status: 'aceito' }, mutate as never),
    NotFoundException
  );
});

// ---------------- checklist / completude ----------------

void test('checklist: canUpload/canReview vem do backend; board_viewer le e recebe canUpload=false', async () => {
  const { service } = build({
    access: {
      requireMember: async () => ({ role: 'board_viewer', profileId: null }),
      requireRole: async () => {
        throw new ForbiddenException('Insufficient board role');
      },
      requireColumnEditable: async () => undefined,
      canReviewDocuments: async () => false
    }
  });
  const checklist = await service.getChecklist(context as never, 'board-1', 'card-1');
  assert.equal(checklist.canUpload, false);
  assert.equal(checklist.canReview, false);
  assert.equal(checklist.items.length, 1);
  assert.equal(checklist.items[0].state, 'pendente');
});

void test('buildChecklist: estado = envio mais recente; completude so de obrigatorios ativos', () => {
  const types = [
    { ...TYPE, id: 't-req-ok', name: 'A', sortOrder: 0, createdAt: '', updatedAt: '' },
    { ...TYPE, id: 't-req-rej', name: 'B', sortOrder: 1, createdAt: '', updatedAt: '' },
    { ...TYPE, id: 't-req-none', name: 'C', sortOrder: 2, createdAt: '', updatedAt: '' },
    { ...TYPE, id: 't-opt', name: 'D', required: false, sortOrder: 3, createdAt: '', updatedAt: '' },
    { ...TYPE, id: 't-inactive-docs', name: 'E', active: false, sortOrder: 4, createdAt: '', updatedAt: '' },
    { ...TYPE, id: 't-inactive-empty', name: 'F', active: false, sortOrder: 5, createdAt: '', updatedAt: '' }
  ];
  const docs = [
    documentRow({ id: 'd4', documentTypeId: 't-req-rej', status: 'rejeitado', rejectionReason: 'x' }),
    documentRow({ id: 'd3', documentTypeId: 't-req-ok', status: 'aceito' }),
    documentRow({ id: 'd2', documentTypeId: 't-req-rej', status: 'aceito' }),
    documentRow({ id: 'd1', documentTypeId: 't-inactive-docs', status: 'aceito' })
  ];
  const result = buildChecklist(types, docs);
  assert.deepEqual(
    result.items.map((item) => [item.documentTypeId, item.state, item.history.length]),
    [
      ['t-req-ok', 'aceito', 1],
      ['t-req-rej', 'rejeitado', 2],
      ['t-req-none', 'pendente', 0],
      ['t-opt', 'pendente', 0],
      ['t-inactive-docs', 'aceito', 1]
    ]
  );
  assert.deepEqual(result.completeness, { acceptedRequired: 1, totalRequired: 3, complete: false });
  assert.deepEqual(buildChecklist([], []).completeness, { acceptedRequired: 0, totalRequired: 0, complete: true });
});

void test('checklist: nao membro do quadro recebe 403 antes de ler card ou documentos', async () => {
  let read = false;
  const { service } = build({
    access: {
      requireMember: async () => {
        throw new ForbiddenException({ code: 'board_membership_required' });
      }
    },
    documents: {
      listForCard: async () => {
        read = true;
        return [];
      }
    },
    cards: {
      findById: async () => {
        read = true;
        return CARD;
      }
    }
  });
  await assert.rejects(service.getChecklist(context as never, 'board-1', 'card-1'), ForbiddenException);
  assert.equal(read, false);
});

// ---------------- Sprint 3: sinalizacao checklistPending no modal ----------------

function gatedColumn(requiresCompleteChecklist: boolean, status = 'active') {
  return { findById: async () => ({ id: 'column-1', boardId: 'board-1', requiresCompleteChecklist, status }) };
}

void test('checklistPending (modal): coluna com flag e obrigatorio pendente sinaliza, inclusive documento rejeitado depois da entrada', async () => {
  const pending = build({ columns: gatedColumn(true) });
  assert.equal((await pending.service.getChecklist(context as never, 'board-1', 'card-1')).checklistPending, true);

  const rejectedAfterEntry = build({
    columns: gatedColumn(true),
    documents: { listForCard: async () => [documentRow({ status: 'rejeitado', rejectionReason: 'ilegivel' })] }
  });
  assert.equal((await rejectedAfterEntry.service.getChecklist(context as never, 'board-1', 'card-1')).checklistPending, true);
});

void test('checklistPending (modal): checklist completo, coluna sem flag ou coluna arquivada nao sinalizam', async () => {
  const complete = build({
    columns: gatedColumn(true),
    documents: { listForCard: async () => [documentRow({ status: 'aceito' })] }
  });
  assert.equal((await complete.service.getChecklist(context as never, 'board-1', 'card-1')).checklistPending, false);

  const noFlag = build({ columns: gatedColumn(false) });
  assert.equal((await noFlag.service.getChecklist(context as never, 'board-1', 'card-1')).checklistPending, false);

  const archivedColumn = build({ columns: gatedColumn(true, 'archived') });
  assert.equal((await archivedColumn.service.getChecklist(context as never, 'board-1', 'card-1')).checklistPending, false);
});
