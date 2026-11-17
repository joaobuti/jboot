import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CustomerValidationRepository } from './customer-validation.repository';

const snapshot = [{ type: 'cpf' as const, documentId: randomUUID(), version: 1 }];

function newRun(customerId: string, executorIdentityId: string) {
  return {
    id: randomUUID(),
    customerId,
    officeId: null,
    agentId: randomUUID(),
    executorIdentityId,
    requestedByIdentityId: randomUUID(),
    snapshot,
    residenceProofThirdParty: false,
    cpfOnIdentity: false
  };
}

void test('validacao: um run em andamento por cliente; parecer so do executor e so com run dispatched', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const central = randomUUID();
    const first = await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central));
    assert.ok(first);
    assert.equal(await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central)), null);
    const answerInput = { id: first.id, executorIdentityId: central, verdict: 'aprovado' as const, findings: [], summary: 'ok', extractedData: null };
    assert.equal(await repository.answer(TEST_DATABASE_REF, clientId, answerInput), null, 'dispatching ainda nao aceita parecer');
    await repository.markDispatched(TEST_DATABASE_REF, clientId, first.id, randomUUID(), 'https://claude.ai/code/s');
    assert.equal(await repository.answer(TEST_DATABASE_REF, clientId, { ...answerInput, executorIdentityId: randomUUID() }), null);
    const answered = await repository.answer(TEST_DATABASE_REF, clientId, answerInput);
    assert.equal(answered?.status, 'answered');
    assert.equal(answered?.verdict, 'aprovado');
    assert.ok(await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central)), 'apos o parecer, novo pedido e aceito');
  }));

void test('validacao: confirmacao so de run respondido e uma unica vez', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const central = randomUUID();
    const run = await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central));
    assert.ok(run);
    assert.equal(await repository.confirm(TEST_DATABASE_REF, clientId, customerId, run.id, randomUUID()), null);
    await repository.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), null);
    await repository.answer(TEST_DATABASE_REF, clientId, { id: run.id, executorIdentityId: central, verdict: 'pendencias', findings: [], summary: 'x', extractedData: null });
    const confirmed = await repository.confirm(TEST_DATABASE_REF, clientId, customerId, run.id, randomUUID());
    assert.ok(confirmed?.confirmedAt);
    assert.equal(await repository.confirm(TEST_DATABASE_REF, clientId, customerId, run.id, randomUUID()), null);
    assert.equal(await repository.confirm(TEST_DATABASE_REF, clientId, randomUUID(), run.id, randomUUID()), null, 'outro cliente');
  }));

void test('validacao: run dispatched parado expira e libera novo pedido; falha so sai de dispatching', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const central = randomUUID();
    const run = await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central));
    assert.ok(run);
    await repository.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), null);
    await repository.markFailed(TEST_DATABASE_REF, clientId, run.id, 'late_failure');
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, run.id))?.status, 'dispatched');
    await client.query(`UPDATE kanban_customer_validation_runs SET updated_at = now() - interval '2 hours' WHERE id = $1`, [run.id]);
    await repository.expireStale(TEST_DATABASE_REF, clientId, customerId);
    const expired = await repository.findById(TEST_DATABASE_REF, clientId, run.id);
    assert.equal(expired?.status, 'expired');
    assert.equal(expired?.errorCode, 'routine_not_reached');
    assert.ok(await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central)));
  }));

void test('validacao: rotina que nao leu o pedido em 5 min libera o botao; a que leu tem 15 min sem chamar o conector', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const central = randomUUID();
    const age = (id: string, minutes: number) =>
      client.query(`UPDATE kanban_customer_validation_runs SET updated_at = now() - make_interval(mins => $2) WHERE id = $1`, [id, minutes]);
    const dispatched = async (customerId: string) => {
      const run = await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central));
      assert.ok(run);
      await repository.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), null);
      return run.id;
    };
    const notReached = randomUUID();
    const notReachedRun = await dispatched(notReached);
    await age(notReachedRun, 4);
    await repository.expireStaleForCustomers(TEST_DATABASE_REF, clientId, [notReached]);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, notReachedRun))?.status, 'dispatched', 'ainda no prazo de 5 min');
    await age(notReachedRun, 6);
    await repository.expireStaleForCustomers(TEST_DATABASE_REF, clientId, [notReached]);
    const expired = await repository.findById(TEST_DATABASE_REF, clientId, notReachedRun);
    assert.deepEqual([expired?.status, expired?.errorCode], ['expired', 'routine_not_reached']);

    const working = randomUUID();
    const workingRun = await dispatched(working);
    await age(workingRun, 4);
    await repository.touchByRoutine(TEST_DATABASE_REF, clientId, workingRun);
    await age(workingRun, 10);
    await repository.expireStale(TEST_DATABASE_REF, clientId, working);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, workingRun))?.status, 'dispatched', 'rotina lendo documentos nao expira em 5 min');
    await age(workingRun, 16);
    await repository.expireStale(TEST_DATABASE_REF, clientId, working);
    const silent = await repository.findById(TEST_DATABASE_REF, clientId, workingRun);
    assert.deepEqual([silent?.status, silent?.errorCode], ['expired', 'routine_no_answer']);
  }));

void test('validacao: conta principal = agente e executora do escritorio principal', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const central = randomUUID();
    const agentId = randomUUID();
    assert.equal(await repository.getSettings(TEST_DATABASE_REF, clientId), null);
    // Sem escritorio principal nao ha onde gravar a conta principal.
    assert.equal(await repository.putSettings(TEST_DATABASE_REF, clientId, agentId, central), null);
    const principal = await db.queryForDatabaseRef<{ id: string }>(
      TEST_DATABASE_REF,
      `INSERT INTO kanban_offices (client_id, name, created_by_identity_id, is_principal) VALUES ($1, 'Matriz', $2, true) RETURNING id`,
      [clientId, central]
    );
    await repository.putSettings(TEST_DATABASE_REF, clientId, agentId, central);
    const saved = await repository.getSettings(TEST_DATABASE_REF, clientId);
    assert.equal(saved?.officeId, principal.rows[0].id);
    assert.equal(saved?.agentId, agentId);
    assert.equal(saved?.executorIdentityId, central);
  }));

void test('validacao: ultimos runs em lote respeitam o limite por cliente e nao misturam clientes', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const central = randomUUID();
    const [customerA, customerB] = [randomUUID(), randomUUID()];
    for (let i = 0; i < 3; i += 1) {
      const run = await repository.create(TEST_DATABASE_REF, clientId, newRun(customerA, central));
      assert.ok(run);
      await repository.markFailed(TEST_DATABASE_REF, clientId, run.id, 'x');
    }
    await repository.create(TEST_DATABASE_REF, clientId, newRun(customerB, central));
    const rows = await repository.listRecentForCustomers(TEST_DATABASE_REF, clientId, [customerA, customerB], 2);
    assert.equal(rows.filter((row) => row.customerId === customerA).length, 2);
    assert.equal(rows.filter((row) => row.customerId === customerB).length, 1);
    assert.deepEqual(await repository.listRecentForCustomers(TEST_DATABASE_REF, randomUUID(), [customerA], 2), []);
  }));

void test('validacao por escritorio: parecer so de responsavel do escritorio do run; configuracao por escritorio', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const owner = randomUUID();
    const [responsible, member] = [randomUUID(), randomUUID()];
    const office = (await client.query<{ id: string }>(
      `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, 'Manaus', $2) RETURNING id`,
      [clientId, owner]
    )).rows[0].id;
    await client.query(
      `INSERT INTO kanban_user_offices (client_id, identity_id, office_id, created_by_identity_id, is_responsible)
       VALUES ($1, $2, $4, $5, true), ($1, $3, $4, $5, false)`,
      [clientId, responsible, member, office, owner]
    );

    await repository.putOfficeSettings(TEST_DATABASE_REF, clientId, office, randomUUID(), owner);
    assert.equal((await repository.getOfficeSettings(TEST_DATABASE_REF, clientId, office))?.agentOwnerIdentityId, owner);
    assert.equal((await repository.listOfficeSettings(TEST_DATABASE_REF, clientId)).length, 1);
    assert.equal(await repository.isOfficeResponsible(TEST_DATABASE_REF, clientId, office, responsible), true);
    assert.equal(await repository.isOfficeResponsible(TEST_DATABASE_REF, clientId, office, member), false);

    const runRow = await repository.create(TEST_DATABASE_REF, clientId, { ...newRun(customerId, owner), officeId: office });
    assert.ok(runRow);
    assert.equal(runRow.officeId, office);
    await repository.markDispatched(TEST_DATABASE_REF, clientId, runRow.id, randomUUID(), null);
    const answer = (identity: string) =>
      repository.answer(TEST_DATABASE_REF, clientId, { id: runRow.id, executorIdentityId: identity, verdict: 'aprovado', findings: [], summary: 'ok', extractedData: null });
    assert.equal(await answer(owner), null, 'dono do agente nao responde por escritorio');
    assert.equal(await answer(member), null, 'membro sem marcacao de responsavel');
    assert.equal((await answer(responsible))?.status, 'answered');

    await repository.deleteOfficeSettings(TEST_DATABASE_REF, clientId, office);
    assert.equal(await repository.getOfficeSettings(TEST_DATABASE_REF, clientId, office), null);
  }));

void test('validacao (ADR 019): pedido guarda politica e modelo; parecer guarda valores do kit; revisao so no aprovado', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const central = randomUUID();
    assert.equal(await repository.getReadablePolicy(TEST_DATABASE_REF, clientId), null);
    await repository.putReadablePolicy(TEST_DATABASE_REF, clientId, ['identidade', 'extrato_beneficio'], central);
    assert.deepEqual(await repository.getReadablePolicy(TEST_DATABASE_REF, clientId), ['identidade', 'extrato_beneficio']);
    const office = randomUUID();
    const run = await repository.create(TEST_DATABASE_REF, clientId, {
      ...newRun(customerId, central),
      readableDocumentTypes: ['identidade', 'extrato_beneficio'],
      contract: { officeId: office, version: 4 }
    });
    assert.ok(run);
    assert.deepEqual([run.readableDocumentTypes, run.contractOfficeId, run.contractVersion], [['identidade', 'extrato_beneficio'], office, 4]);
    await repository.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), null);
    const review = { values: { NOME_COMPLETO: 'MARIA' }, gender: 'feminino' as const, waiverCourt: 'jec' as const };
    const answered = await repository.answer(TEST_DATABASE_REF, clientId, {
      id: run.id, executorIdentityId: central, verdict: 'aprovado', findings: [], summary: 'ok', extractedData: null,
      kit: { tagValues: { NOME_COMPLETO: 'MARIA DA SILVA', BANCO_1: 'CREFISA' }, gender: 'feminino', waiverCourt: 'jef', generalFindings: [], alerts: ['CNH vencida'] }
    });
    assert.deepEqual([answered?.tagValues, answered?.gender, answered?.waiverCourt, answered?.alerts],
      [{ NOME_COMPLETO: 'MARIA DA SILVA', BANCO_1: 'CREFISA' }, 'feminino', 'jef', ['CNH vencida']]);
    const reviewer = randomUUID();
    const saved = await repository.saveReview(TEST_DATABASE_REF, clientId, customerId, run.id, review, reviewer);
    assert.deepEqual([saved?.review, saved?.reviewedByIdentityId, saved?.tagValues?.NOME_COMPLETO], [review, reviewer, 'MARIA DA SILVA']);
    assert.equal(await repository.saveReview(TEST_DATABASE_REF, clientId, randomUUID(), run.id, review, reviewer), null, 'outro cliente');
    // parecer com pendencias nao aceita revisao
    const other = await repository.create(TEST_DATABASE_REF, clientId, newRun(randomUUID(), central));
    assert.ok(other);
    await repository.markDispatched(TEST_DATABASE_REF, clientId, other.id, randomUUID(), null);
    await repository.answer(TEST_DATABASE_REF, clientId, { id: other.id, executorIdentityId: central, verdict: 'pendencias', findings: [], summary: 'x', extractedData: null });
    assert.equal(await repository.saveReview(TEST_DATABASE_REF, clientId, other.customerId, other.id, review, reviewer), null);
  }));

void test('validacao: listagem expira em lote o run dispatched parado e nao toca o recente nem outro tenant', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const central = randomUUID();
    const stale = await repository.create(TEST_DATABASE_REF, clientId, newRun(randomUUID(), central));
    const fresh = await repository.create(TEST_DATABASE_REF, clientId, newRun(randomUUID(), central));
    assert.ok(stale && fresh);
    for (const run of [stale, fresh]) await repository.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), null);
    await client.query(`UPDATE kanban_customer_validation_runs SET updated_at = clock_timestamp() - interval '31 minutes' WHERE id = $1`, [stale.id]);
    await repository.expireStaleForCustomers(TEST_DATABASE_REF, randomUUID(), [stale.customerId]);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, stale.id))?.status, 'dispatched', 'outro tenant nao expira');
    await repository.expireStaleForCustomers(TEST_DATABASE_REF, clientId, [stale.customerId, fresh.customerId]);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, stale.id))?.status, 'expired');
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, fresh.id))?.status, 'dispatched');
  }));

void test('validacao (ADR 019, decisao 16): board de entrada por escritorio e resultado do card no run', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const identity = randomUUID();
    const office = randomUUID();
    const board = randomUUID();
    await client.query(`INSERT INTO kanban_offices (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Manaus', $3)`, [office, clientId, identity]);
    await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Manaus', $3)`, [board, clientId, identity]);
    assert.equal((await repository.listIntakeBoards(TEST_DATABASE_REF, clientId)).size, 0);
    await repository.putIntakeBoard(TEST_DATABASE_REF, clientId, office, board, identity);
    assert.equal((await repository.listIntakeBoards(TEST_DATABASE_REF, clientId)).get(office), board);
    assert.equal((await repository.listIntakeBoards(TEST_DATABASE_REF, randomUUID())).size, 0, 'outro tenant');

    const created = await repository.create(TEST_DATABASE_REF, clientId, { ...newRun(randomUUID(), identity), intakeOfficeId: office });
    assert.ok(created);
    assert.equal(created.intakeOfficeId, office);
    await repository.setIntake(TEST_DATABASE_REF, clientId, created.id, 'no_backlog', board, null);
    const reloaded = await repository.findById(TEST_DATABASE_REF, clientId, created.id);
    assert.deepEqual([reloaded?.intakeResult, reloaded?.intakeBoardId, reloaded?.intakeCardId], ['no_backlog', board, null]);
    assert.equal(await repository.findActiveCustomerCard(TEST_DATABASE_REF, clientId, board, created.customerId), null);

    await repository.deleteIntakeBoard(TEST_DATABASE_REF, clientId, office);
    assert.equal((await repository.listIntakeBoards(TEST_DATABASE_REF, clientId)).size, 0);
  }));

void test('kit (Sprint 4): grava o kit, marca o run, enfileira o Drive ativo e resume para a tela', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const central = randomUUID();
    const office = (await client.query<{ id: string }>(
      `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, 'Manaus', $2) RETURNING id`,
      [clientId, central]
    )).rows[0].id;
    const created = await repository.create(TEST_DATABASE_REF, clientId, newRun(customerId, central));
    assert.ok(created);
    const kit = (id: string, runId: string) => ({
      id, customerId, runId, officeId: office, contractVersion: 2, storageKey: `k/${id}.docx`, fileName: 'KIT_MARIA_2026-10-28.docx',
      sizeBytes: 100, sha256: 'a'.repeat(64), report: { emptyTags: ['PROFISSAO'], unresolvedMarks: [], warnings: [] }
    });

    // Drive desligado: kit gravado sem fila (a reconciliacao envia depois).
    const first = randomUUID();
    assert.deepEqual(await repository.saveKit(TEST_DATABASE_REF, clientId, kit(first, created.id), central), { driveQueued: false });
    const row = await repository.findById(TEST_DATABASE_REF, clientId, created.id);
    assert.deepEqual([row?.kitResult, row?.kitId], ['generated', first]);
    const [summary] = await repository.kitSummaries(TEST_DATABASE_REF, clientId, [first]);
    assert.deepEqual([summary.fileName, summary.driveState, summary.driveActive], ['KIT_MARIA_2026-10-28.docx', null, false]);
    assert.deepEqual(summary.report.emptyTags, ['PROFISSAO']);

    // Drive ativo: o kit entra na fila como office_kit, com o cliente.
    await client.query(
      `INSERT INTO kanban_drive_configurations (client_id, provider, credential_mode, root_folder_id, status, updated_by_identity_id, refresh_token_enc)
       VALUES ($1, 'google_drive', 'oauth', 'root', 'active', $2, '\\x00'::bytea)`,
      [clientId, central]
    );
    const other = await repository.create(TEST_DATABASE_REF, clientId, newRun(randomUUID(), central));
    assert.ok(other);
    const second = randomUUID();
    assert.deepEqual(await repository.saveKit(TEST_DATABASE_REF, clientId, { ...kit(second, other.id), customerId: other.customerId }, central), { driveQueued: true });
    const queued = await client.query(`SELECT source_type, customer_id FROM kanban_document_syncs WHERE client_id = $1 AND document_id = $2`, [clientId, second]);
    assert.deepEqual(queued.rows, [{ source_type: 'office_kit', customer_id: other.customerId }]);
    assert.equal((await repository.kitSummaries(TEST_DATABASE_REF, clientId, [second]))[0].driveState, 'pending');

    await repository.setKitResult(TEST_DATABASE_REF, clientId, created.id, 'not_approved');
    assert.deepEqual([(await repository.findById(TEST_DATABASE_REF, clientId, created.id))?.kitResult, (await repository.findById(TEST_DATABASE_REF, clientId, created.id))?.kitId], ['not_approved', null]);
    await assert.rejects(
      client.query(`UPDATE kanban_customer_validation_runs SET kit_result = 'generated', kit_id = NULL WHERE id = $1`, [created.id]),
      /kanban_customer_validation_runs_kit_result_check/
    );
  }));

void test('kit no card: o mais recente do cliente; download so do proprio cliente e do proprio tenant', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const central = randomUUID();
    const office = (await client.query<{ id: string }>(
      `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, 'Manaus', $2) RETURNING id`,
      [clientId, central]
    )).rows[0].id;
    const saveFor = async (customer: string, fileName: string) => {
      const run = await repository.create(TEST_DATABASE_REF, clientId, newRun(customer, central));
      assert.ok(run);
      const id = randomUUID();
      await repository.saveKit(TEST_DATABASE_REF, clientId, {
        id, customerId: customer, runId: run.id, officeId: office, contractVersion: 1, storageKey: `k/${id}.docx`, fileName,
        sizeBytes: 321, sha256: 'b'.repeat(64), report: { emptyTags: [], unresolvedMarks: [], warnings: [] }
      }, central);
      // Um run em andamento por cliente: encerrado, libera o proximo pedido.
      await client.query(`UPDATE kanban_customer_validation_runs SET status = 'expired' WHERE id = $1`, [run.id]);
      return id;
    };

    assert.equal(await repository.latestKitForCustomer(TEST_DATABASE_REF, clientId, customerId), null);
    const older = await saveFor(customerId, 'KIT_MARIA_2026-10-28.docx');
    await client.query(`UPDATE kanban_customer_office_kits SET created_at = now() - interval '1 day' WHERE id = $1`, [older]);
    const newer = await saveFor(customerId, 'KIT_MARIA_2026-10-30.docx');
    const otherCustomerKit = await saveFor(randomUUID(), 'KIT_JOAO_2026-10-30.docx');

    const latest = await repository.latestKitForCustomer(TEST_DATABASE_REF, clientId, customerId);
    assert.deepEqual([latest?.id, latest?.fileName, latest?.sizeBytes, latest?.storageKey], [newer, 'KIT_MARIA_2026-10-30.docx', 321, `k/${newer}.docx`]);
    assert.equal((await repository.findKitForCustomer(TEST_DATABASE_REF, clientId, customerId, older))?.id, older);
    assert.equal(await repository.findKitForCustomer(TEST_DATABASE_REF, clientId, customerId, otherCustomerKit), null);
    assert.equal(await repository.findKitForCustomer(TEST_DATABASE_REF, randomUUID(), customerId, newer), null);
    assert.equal(await repository.latestKitForCustomer(TEST_DATABASE_REF, randomUUID(), customerId), null);
  }));

void test('card de entrada: responsaveis do escritorio em ordem de vinculo; resultado dos responsaveis gravado no run', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerValidationRepository(db);
    const clientId = randomUUID();
    const owner = randomUUID();
    const [first, second, member] = [randomUUID(), randomUUID(), randomUUID()];
    const office = (await client.query<{ id: string }>(
      `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, 'Manaus', $2) RETURNING id`,
      [clientId, owner]
    )).rows[0].id;
    await client.query(
      `INSERT INTO kanban_user_offices (client_id, identity_id, office_id, created_by_identity_id, is_responsible, created_at)
       VALUES ($1, $2, $5, $6, true, now() - interval '2 days'), ($1, $3, $5, $6, true, now() - interval '1 day'), ($1, $4, $5, $6, false, now())`,
      [clientId, first, second, member, office, owner]
    );
    assert.deepEqual(await repository.listOfficeResponsibles(TEST_DATABASE_REF, clientId, office), [first, second]);
    assert.deepEqual(await repository.listOfficeResponsibles(TEST_DATABASE_REF, randomUUID(), office), [], 'outro tenant');

    const created = await repository.create(TEST_DATABASE_REF, clientId, newRun(randomUUID(), owner));
    assert.ok(created);
    const assignees = { assigned: [first], skipped: [{ identityId: second, reason: 'not_board_member' as const }] };
    await repository.setIntake(TEST_DATABASE_REF, clientId, created.id, 'created', randomUUID(), randomUUID(), assignees);
    assert.deepEqual((await repository.findById(TEST_DATABASE_REF, clientId, created.id))?.intakeAssignees, assignees);
    await repository.setIntake(TEST_DATABASE_REF, clientId, created.id, 'no_board', null, null);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, created.id))?.intakeAssignees, null);
  }));
