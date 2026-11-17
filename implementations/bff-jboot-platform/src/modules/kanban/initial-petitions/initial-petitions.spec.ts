import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ActionAnalysisRepository } from '../action-analysis/action-analysis.repository';
import { samplePetition } from './document/petition-fixture';
import { finishProblems } from './initial-petitions.input';
import { ClosingPetition, InitialPetitionsRepository } from './initial-petitions.repository';
import { InitialPetitionsService, todayInBrazil } from './initial-petitions.service';

const context = { databaseRef: 'ref', clientId: 'client', identityId: 'owner' } as never;
const report = {
  excludedContracts: [], pendingData: ['RG em XXXX'], courtsToCheck: [], precedents: [], themesWithoutStateRuling: [], alerts: [], pendingDecisions: []
};

void test('fechamento: concluida exige relatorio e peticao; cada acao em uma peticao ou com motivo', () => {
  const drafts = [{ petitionKey: 'pan', actionIds: ['a1'] }];
  assert.deepEqual(finishProblems({ status: 'concluida', report, actionsWithoutPetition: [{ actionId: 'a2', reason: 'litispendencia' }] }, drafts, ['a1', 'a2']), []);
  assert.deepEqual(finishProblems({ status: 'concluida', report }, [], null), ['Nenhuma peticao foi enviada nesta execucao (flow_submit_initial_petition).']);
  assert.match(finishProblems({ status: 'concluida', report }, drafts, ['a1', 'a2'])[0], /Acoes sem peticao e sem motivo: a2/);
  assert.match(
    finishProblems({ status: 'concluida', report, actionsWithoutPetition: [{ actionId: 'a1', reason: 'x' }, { actionId: 'a2', reason: 'y' }] }, drafts, ['a1', 'a2'])[0],
    /esta na peticao "pan" e em actionsWithoutPetition/
  );
  assert.deepEqual(finishProblems({ status: 'concluida' }, drafts, null), ['report e obrigatorio com status = concluida.']);
  assert.deepEqual(finishProblems({ status: 'nao_concluida' }, drafts, null), ['failureReason e obrigatorio quando status = nao_concluida.']);
  assert.equal(todayInBrazil(new Date('2026-10-29T02:30:00Z')), '2026-10-28', 'data de Sao Paulo, nao UTC');
});

interface Fake {
  actionConfig: Record<string, unknown>;
  analysis: { id: string; actions: Array<{ id: string }> } | null;
  drafts: Array<{ petitionKey: string; fileName: string; actionIds: string[]; court: 'jec'; bank: string; content: ReturnType<typeof samplePetition> }>;
  closed: boolean;
  calls: string[];
  closingGaps?: string[];
}

function service(f: Fake) {
  const repository = {
    figureIds: async () => new Set(['print-1']),
    figures: async () => [{ figureId: 'print-1', png: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082', 'hex'), width: 1, height: 1 }],
    drafts: async () => f.drafts,
    saveDraft: async (_r: string, _c: string, _run: string, draft: { petitionKey: string }) => { f.calls.push(`draft:${draft.petitionKey}`); },
    createClosingRun: async (_r: string, _c: string, input: { petitions: ClosingPetition[]; status: string; closingGaps: string[] }) => {
      f.calls.push(`close:${input.status}:${input.petitions.length}`);
      f.closingGaps = input.closingGaps;
      return f.closed ? null : { id: 'petition-run-1', completedEvent: input.status === 'concluida' && input.petitions.length > 0 };
    }
  };
  return new InitialPetitionsService(
    repository as never,
    { findDispatchedForOwner: async () => ({ id: 'run-1', boardId: 'board', boardColumnId: 'col', cardId: 'card', actionConfig: f.actionConfig }), touchDispatched: async () => undefined } as never,
    { latestConcludedForCard: async () => f.analysis } as never,
    { findByCard: async () => ({ customerId: 'customer' }) } as never,
    {} as never,
    {} as never,
    {
      evaluate: async () => ({
        ok: true,
        context: { uf: 'SC', closing: { place: null, signer: { identityId: 'adv', name: 'Maria', oabNumber: '1', oabUf: 'SC' }, gaps: ['office_without_city'] } }
      })
    } as never,
    {
      buildGeneratedDocumentKey: (p: { documentId: string }) => `client/card/generated/${p.documentId}.docx`,
      upload: async (key: string) => { f.calls.push(`upload:${key.endsWith('.docx')}`); },
      deleteQuietly: async () => { f.calls.push('delete'); return true; },
      bucketName: 'bucket'
    } as never,
    { requireVisibleCard: async () => ({}) } as never,
    { createSystemEvent: async (_r: string, _c: string, _card: string, _who: string, kind: string) => { f.calls.push(`event:${kind}`); } } as never,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never
  );
}

const fresh = (overrides: Partial<Fake> = {}): Fake => ({
  actionConfig: { expectedResult: 'initial_petitions', documentGenerator: 'flow' },
  analysis: { id: 'analysis-1', actions: [{ id: 'a1' }, { id: 'a2' }] },
  drafts: [],
  closed: false,
  calls: [],
  ...overrides
});

void test('envio: confere conteudo, acoes da analise e acao repetida; grava como provisoria', async () => {
  const f = fresh();
  const ok = await service(f).connectorSubmit(context, 'run-1', { petitionKey: 'santander', actionIds: ['a1'], content: samplePetition() }, context);
  assert.deepEqual([ok.fileName, f.calls], ['Inicial_JEC_Santander_Sergio.docx', ['draft:santander']]);

  const reject = (input: Parameters<InitialPetitionsService['connectorSubmit']>[2], fake = fresh()) =>
    assert.rejects(service(fake).connectorSubmit(context, 'run-1', input, context), (error: Error & { code?: string }) => {
      assert.equal(error.code, 'invalid_petition');
      return true;
    });
  await reject({ petitionKey: 'x', actionIds: ['a9'], content: samplePetition() });
  await reject({ petitionKey: 'x', actionIds: [], content: samplePetition({ addressing: 'AO JUIZADO — CIVEL' }) });
  await reject(
    { petitionKey: 'outra', actionIds: ['a1'], content: samplePetition({ fileBank: 'PAN' }) },
    fresh({ drafts: [{ petitionKey: 'santander', fileName: 'Inicial_JEC_Santander_Sergio.docx', actionIds: ['a1'], court: 'jec', bank: 'Santander', content: samplePetition() }] })
  );
  await reject({ petitionKey: 'x', actionIds: ['a1'], content: samplePetition() }, fresh({ analysis: null }));
  await assert.rejects(
    service(fresh({ actionConfig: { expectedResult: 'initial_petitions', documentGenerator: 'ai' } })).connectorSubmit(context, 'run-1', { petitionKey: 'x', actionIds: [], content: samplePetition() }, context),
    (error: Error & { code?: string }) => error.code === 'generator_is_ai'
  );
  await assert.rejects(
    service(fresh({ actionConfig: { expectedResult: 'action_analysis' } })).connectorSubmit(context, 'run-1', { petitionKey: 'x', actionIds: [], content: samplePetition() }, context),
    (error: Error & { code?: string }) => error.code === 'wrong_expected_result'
  );
});

void test('fechamento: monta e grava as peticoes, encerra e move; execucao ja encerrada remove os arquivos', async () => {
  const draft = { petitionKey: 'santander', fileName: 'Inicial_JEC_Santander_Sergio.docx', actionIds: ['a1'], court: 'jec' as const, bank: 'Santander', content: samplePetition() };
  const f = fresh({ drafts: [draft] });
  const result = await service(f).connectorFinish(context, 'run-1', { status: 'concluida', report, actionsWithoutPetition: [{ actionId: 'a2', reason: 'litispendencia' }] }, context);
  assert.deepEqual([result.petitionCount, result.automationCompleted], [1, true]);
  assert.deepEqual(f.calls, ['upload:true', 'close:concluida:1', 'event:card.initial_petitions_registered']);
  assert.deepEqual(f.closingGaps, ['office_without_city'], 'pendencias do fecho vao para a execucao');

  const closed = fresh({ drafts: [draft], closed: true });
  await assert.rejects(
    service(closed).connectorFinish(context, 'run-1', { status: 'concluida', report, actionsWithoutPetition: [{ actionId: 'a2', reason: 'x' }] }, context),
    (error: Error & { code?: string }) => error.code === 'run_closed'
  );
  assert.deepEqual(closed.calls, ['upload:true', 'close:concluida:1', 'delete']);

  const failed = fresh({ drafts: [draft] });
  const notConcluded = await service(failed).connectorFinish(context, 'run-1', { status: 'nao_concluida', failureReason: 'HISCON ilegivel' }, context);
  assert.equal(notConcluded.automationCompleted, false);
  assert.deepEqual(failed.calls, ['close:nao_concluida:0', 'event:card.initial_petitions_registered'], 'sem arquivo e sem conclusao');
});

async function fixture(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }) {
  const owner = randomUUID(), clientId = randomUUID(), boardId = randomUUID(), columnId = randomUUID(), cardId = randomUUID();
  const ruleId = randomUUID(), activityId = randomUUID(), runId = randomUUID(), analysisRunId = randomUUID(), activity2 = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, owner]);
  await client.query(`INSERT INTO kanban_board_columns (id,client_id,board_id,name,position) VALUES($1,$2,$3,'Iniciais',0)`, [columnId, clientId, boardId]);
  await client.query(`INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id) VALUES($1,$2,$3,$4,'Card',0,$5)`, [cardId, clientId, boardId, columnId, owner]);
  await client.query(
    `INSERT INTO kanban_column_automation_rules (id,client_id,board_id,board_column_id,trigger_type,action_type,recipient_role,action_config,created_by_identity_id)
     VALUES($1,$2,$3,$4,'column_entered','execute_ai_agent',NULL,'{"expectedResult":"initial_petitions"}'::jsonb,$5)`,
    [ruleId, clientId, boardId, columnId, owner]
  );
  for (const [id, activity] of [[runId, activityId], [analysisRunId, activity2]]) {
    await client.query(`INSERT INTO kanban_card_activities (id,client_id,card_id,type,author_identity_id,event_payload) VALUES($1,$2,$3,'system_event',$4,'{"kind":"card.moved"}'::jsonb)`, [activity, clientId, cardId, owner]);
    await client.query(
      `INSERT INTO kanban_ai_automation_outbox (id,client_id,automation_rule_id,board_id,board_column_id,card_id,source_activity_id,requester_identity_id,agent_id,trigger_type,action_config,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'column_entered','{}'::jsonb,'dispatched')`,
      [id, clientId, ruleId, boardId, columnId, cardId, activity, owner, randomUUID()]
    );
  }
  return { owner, clientId, cardId, runId, analysisRunId };
}

void test('PostgreSQL: fechamento grava execucao, peticao, vinculo e documento rascunho; aprovacao pede o PDF', () =>
  withTestDatabase(async (db, client) => {
    const f = await fixture(client);
    const customerId = randomUUID();
    const analyses = new ActionAnalysisRepository(db);
    await analyses.createClosingRun(TEST_DATABASE_REF, f.clientId, {
      runId: f.analysisRunId, cardId: f.cardId, customerId, ownerIdentityId: f.owner,
      analysis: { status: 'concluida', header: { holderName: 'X', benefitNumber: '1', statementDate: 'd' }, actions: [{ block: 'b', bank: 'PAN', year: '2021', contracts: [{ number: '1' }] }] }
    });
    const analysis = await analyses.latestConcludedForCard(TEST_DATABASE_REF, f.clientId, f.cardId);
    const actionId = analysis!.actions[0].id;
    const repository = new InitialPetitionsRepository(db);
    await repository.saveFigure(TEST_DATABASE_REF, f.clientId, f.runId, { figureId: 'print-1', png: Buffer.from([1, 2, 3]), width: 1, height: 1 });
    await repository.saveDraft(TEST_DATABASE_REF, f.clientId, f.runId, { petitionKey: 'pan', court: 'jec', bank: 'PAN', fileName: 'Inicial_JEC_PAN_Sergio.docx', actionIds: [actionId], content: samplePetition() });
    assert.deepEqual([...(await repository.figureIds(TEST_DATABASE_REF, f.clientId, f.runId))], ['print-1']);

    const petitionId = randomUUID(), documentId = randomUUID();
    const input = {
      runId: f.runId, cardId: f.cardId, customerId, ownerIdentityId: f.owner, generator: 'flow' as const, status: 'concluida' as const,
      failureReason: null, analysisId: analysis!.id, uf: 'SC', closingGaps: ['office_without_city'],
      report: { ...report, precedents: [{ processNumber: '5000000-00.2025.8.24.0023', url: 'https://tjsc.jus.br/x' }], actionsWithoutPetition: [] },
      petitions: [{
        petitionId, documentId, petitionKey: 'pan', court: 'jec' as const, bank: 'PAN', fileName: 'Inicial_JEC_PAN_Sergio.docx', actionIds: [actionId],
        content: samplePetition(), storageBucket: 'b', storageKey: `${f.clientId}/${f.cardId}/generated/${documentId}.docx`, sha256: 'a'.repeat(64), sizeBytes: 10
      }]
    };
    const created = await repository.createClosingRun(TEST_DATABASE_REF, f.clientId, input);
    assert.ok(created);
    assert.equal(created.completedEvent, true, 'concluida com peticao: conclusao sem erro');
    assert.equal(await repository.createClosingRun(TEST_DATABASE_REF, f.clientId, input), null, 'segundo fechamento');
    const outbox = await client.query(`SELECT status FROM kanban_ai_automation_outbox WHERE id = $1`, [f.runId]) as { rows: Array<{ status: string }> };
    assert.equal(outbox.rows[0].status, 'completed');
    assert.deepEqual(await repository.drafts(TEST_DATABASE_REF, f.clientId, f.runId), [], 'rascunhos consumidos');

    const latest = await repository.latestForCard(TEST_DATABASE_REF, f.clientId, f.cardId);
    assert.deepEqual([latest?.triageSource, latest?.petitions.length, latest?.petitions[0].actionIds], ['analysis', 1, [actionId]]);
    assert.deepEqual([latest?.petitions[0].document?.status, latest?.petitions[0].document?.version], ['rascunho', 1]);
    assert.equal(latest?.completed, true);
    assert.deepEqual(latest?.closingGaps, ['office_without_city'], 'pendencias do fecho gravadas na execucao');
    const completion = await client.query(
      `SELECT count(*)::int AS n FROM kanban_card_activities
       WHERE card_id = $1 AND event_payload->>'kind' = 'ai.automation_completed' AND event_payload->>'automationRunId' = $2`,
      [f.cardId, f.runId]
    ) as { rows: Array<{ n: number }> };
    assert.equal(completion.rows[0].n, 1, 'evento lido pelas regras ai_completed -> move_card');
    const precedents = await client.query(`SELECT uf FROM kanban_petition_precedents WHERE petition_run_id = $1`, [created!.id]) as { rows: Array<{ uf: string }> };
    assert.deepEqual(precedents.rows, [{ uf: 'SC' }]);

    assert.equal((await repository.findDocument(TEST_DATABASE_REF, f.clientId, f.cardId, documentId))?.fileName, 'Inicial_JEC_PAN_Sergio.docx');
    await client.query(
      `INSERT INTO kanban_drive_configurations (client_id, provider, credential_mode, root_folder_id, status, updated_by_identity_id, refresh_token_enc)
       VALUES ($1, 'google_drive', 'oauth', 'root', 'active', $2, '\\x00'::bytea)`,
      [f.clientId, f.owner]
    );
    assert.equal(await repository.approve(TEST_DATABASE_REF, f.clientId, f.cardId, documentId, f.owner), true);
    assert.equal(await repository.approve(TEST_DATABASE_REF, f.clientId, f.cardId, documentId, f.owner), false, 'ja aprovado');
    const doc = await client.query(`SELECT status, pdf_status FROM kanban_card_generated_documents WHERE id = $1`, [documentId]) as { rows: Array<{ status: string; pdf_status: string }> };
    assert.deepEqual(doc.rows[0], { status: 'aprovado', pdf_status: 'pending' });
    assert.equal(await repository.findDocument(TEST_DATABASE_REF, randomUUID(), f.cardId, documentId), null, 'outro tenant');

    // S8: versao corrigida da aprovada; aprovada, o Drive atualiza o mesmo arquivo da versao 1.
    await client.query(`UPDATE kanban_document_syncs SET state = 'synced', remote_file_id = 'remote-v1' WHERE client_id = $1 AND document_id = $2`, [f.clientId, documentId]);
    const correctedId = randomUUID();
    const corrected = (id: string, base: string) => repository.insertCorrected(TEST_DATABASE_REF, f.clientId, {
      documentId: id, cardId: f.cardId, baseDocumentId: base, storageBucket: 'b',
      storageKey: `${f.clientId}/${f.cardId}/generated/${id}.docx`, sha256: 'b'.repeat(64), sizeBytes: 20, identityId: f.owner
    });
    assert.deepEqual(await corrected(correctedId, documentId), { ok: true, petitionId, version: 2, replacedStatus: 'aprovado' });
    assert.deepEqual(await corrected(randomUUID(), documentId), { ok: false, reason: 'not_current' }, 'versao substituida');
    assert.deepEqual(await corrected(randomUUID(), randomUUID()), { ok: false, reason: 'not_found' });
    const current = await repository.latestForCard(TEST_DATABASE_REF, f.clientId, f.cardId);
    assert.deepEqual(
      [current?.petitions[0].document?.documentId, current?.petitions[0].document?.status, current?.petitions[0].document?.origin],
      [correctedId, 'rascunho', 'uploaded_edit'],
      'a corrigida e a atual, pendente de aprovacao'
    );
    assert.equal(await repository.approve(TEST_DATABASE_REF, f.clientId, f.cardId, correctedId, f.owner), true);
    const sync = await client.query(`SELECT remote_file_id, document_version FROM kanban_document_syncs WHERE client_id = $1 AND document_id = $2`, [f.clientId, correctedId]) as { rows: Array<{ remote_file_id: string | null; document_version: number }> };
    assert.deepEqual(sync.rows, [{ remote_file_id: 'remote-v1', document_version: 2 }], 'mesmo arquivo do Drive');

    await client.query(`UPDATE kanban_card_initial_petitions SET protocol_number = '00000016820268260100', protocoled_at = now() WHERE id = $1`, [petitionId]);
    assert.deepEqual(await corrected(randomUUID(), correctedId), { ok: false, reason: 'protocoled' }, 'protocolo trava a correcao');
  }));

void test('PostgreSQL: documento de peticao nao aceita dado de lead; rascunho de execucao encerrada e descartado', () =>
  withTestDatabase(async (db, client) => {
    const f = await fixture(client);
    await client.query('SAVEPOINT mix');
    await assert.rejects(
      client.query(
        `INSERT INTO kanban_card_generated_documents (id, client_id, card_id, version, origin, storage_bucket, storage_key, sha256, size_bytes, created_by_identity_id)
         VALUES ($1, $2, $3, 1, 'routine_petition', 'b', $4, $5, 1, $6)`,
        (() => { const id = randomUUID(); return [id, f.clientId, f.cardId, `${f.clientId}/${f.cardId}/generated/${id}.docx`, 'a'.repeat(64), f.owner]; })()
      ),
      /kanban_card_generated_documents_source_check/,
      'routine_petition sem petition_id'
    );
    await client.query('ROLLBACK TO SAVEPOINT mix');
    const repository = new InitialPetitionsRepository(db);
    await repository.saveDraft(TEST_DATABASE_REF, f.clientId, f.runId, { petitionKey: 'pan', court: 'jec', bank: 'PAN', fileName: 'x.docx', actionIds: [], content: samplePetition() });
    await repository.discardClosedRuns(TEST_DATABASE_REF, f.clientId);
    assert.equal((await repository.drafts(TEST_DATABASE_REF, f.clientId, f.runId)).length, 1, 'execucao em andamento mantem');
    await client.query(`UPDATE kanban_ai_automation_outbox SET status = 'failed' WHERE id = $1`, [f.runId]);
    await repository.discardClosedRuns(TEST_DATABASE_REF, f.clientId);
    assert.equal((await repository.drafts(TEST_DATABASE_REF, f.clientId, f.runId)).length, 0, 'expirada descarta');
  }));
