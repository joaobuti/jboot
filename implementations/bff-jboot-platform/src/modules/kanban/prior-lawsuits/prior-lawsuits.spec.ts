import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { normalizeBank, normalizeCnjNumber } from './prior-lawsuits.input';
import { markDefaultNoPriorLawsuits, PriorLawsuitsRepository } from './prior-lawsuits.repository';
import { buildPriorLawsuits, PriorLawsuitsService } from './prior-lawsuits.service';

const CNJ = '5001234-56.2024.8.24.0023';

void test('numero do processo: padrao CNJ com ou sem mascara; o resto e recusado', () => {
  assert.equal(normalizeCnjNumber(CNJ), CNJ);
  assert.equal(normalizeCnjNumber(' 50012345620248240023 '), CNJ);
  assert.equal(normalizeCnjNumber('5001234.56.2024.8.24.0023'), CNJ);
  assert.equal(normalizeCnjNumber('5001234-56.2024.8.24'), null, 'incompleto');
  assert.equal(normalizeCnjNumber('5001234-56.2024.8.24.XXXX'), null, 'mascarado');
  assert.equal(normalizeBank('  BANCO   PAN  S.A. '), 'BANCO PAN S.A.');
});

void test('situacao: lista vence a confirmacao; sem nenhuma das duas, missing; historico mais recente primeiro', () => {
  const lawsuit = {
    id: 'l1', bank: 'BANCO PAN', processNumber: CNJ, createdByIdentityId: 'u1', createdAt: '2026-10-28T10:00:00Z',
    removedAt: null, removedByIdentityId: null
  };
  const declaration = {
    id: 'd1', declaredByIdentityId: 'u2', declaredAt: '2026-10-28T09:00:00Z',
    revokedAt: '2026-10-28T10:00:00Z', revokedByIdentityId: 'u1', revokedReason: 'lawsuit_added' as const, origin: 'manual' as const
  };
  const names = new Map([['u1', 'Ana'], ['u2', 'Bruno']]);
  const listed = buildPriorLawsuits('c1', [lawsuit], [declaration], names);
  assert.equal(listed.status, 'listed');
  assert.equal(listed.declaration, null);
  assert.deepEqual(listed.history.map((item) => item.kind).sort(), ['declaration_revoked', 'declared_none', 'lawsuit_added']);
  assert.equal(listed.history.at(-1)?.kind, 'declared_none', 'o mais antigo por ultimo');

  const removed = { ...lawsuit, removedAt: '2026-10-28T11:00:00Z', removedByIdentityId: 'u2' };
  assert.equal(buildPriorLawsuits('c1', [removed], [], names).status, 'missing');
  const current = { ...declaration, revokedAt: null, revokedByIdentityId: null, revokedReason: null };
  const none = buildPriorLawsuits('c1', [removed], [current], names);
  assert.deepEqual([none.status, none.declaration?.declaredByName, none.history[0].kind], ['declared_none', 'Bruno', 'lawsuit_removed']);
});

void test('cliente fora da visibilidade nao chega ao repositorio', async () => {
  const service = new PriorLawsuitsService(
    { add: async () => assert.fail('nao deveria gravar') } as never,
    { requireVisibleCustomer: async () => { throw new NotFoundException('Customer not found'); } } as never,
    { record: async () => assert.fail('nao deveria auditar') } as never,
    {} as never
  );
  await assert.rejects(
    service.add({ databaseRef: 'r', clientId: 'c', identityId: 'u' } as never, 'customer', { bank: 'PAN', processNumber: CNJ }, {} as never),
    NotFoundException
  );
  await assert.rejects(
    service.add({} as never, 'customer', { bank: 'PAN', processNumber: '123' }, {} as never),
    (error: { response?: { code?: string } }) => error.response?.code === 'prior_lawsuit_number_invalid'
  );
});

void test('PostgreSQL: incluir revoga a confirmacao, numero repetido e recusado e confirmar exige lista vazia', () =>
  withTestDatabase(async (db, client) => {
    const repository = new PriorLawsuitsRepository(db);
    const clientId = randomUUID(), customerId = randomUUID(), who = randomUUID();

    assert.deepEqual(await repository.declareNone(TEST_DATABASE_REF, clientId, customerId, who), { outcome: 'declared', created: true });
    assert.deepEqual(await repository.declareNone(TEST_DATABASE_REF, clientId, customerId, who), { outcome: 'declared', created: false }, 'repetir nao duplica');

    const added = await repository.add(TEST_DATABASE_REF, clientId, customerId, { bank: 'BANCO PAN', processNumber: CNJ, identityId: who });
    assert.equal(added?.revokedDeclaration, true);
    assert.equal(await repository.add(TEST_DATABASE_REF, clientId, customerId, { bank: 'OUTRO', processNumber: CNJ, identityId: who }), null);
    assert.deepEqual(await repository.declareNone(TEST_DATABASE_REF, clientId, customerId, who), { outcome: 'has_lawsuits' });

    const reason = await client.query(
      `SELECT revoked_reason FROM kanban_customer_prior_lawsuit_declarations WHERE client_id = $1 AND customer_id = $2`,
      [clientId, customerId]
    ) as { rows: Array<{ revoked_reason: string }> };
    assert.deepEqual(reason.rows.map((row) => row.revoked_reason), ['lawsuit_added']);

    assert.ok(await repository.remove(TEST_DATABASE_REF, clientId, customerId, added!.lawsuit.id, who));
    assert.equal(await repository.remove(TEST_DATABASE_REF, clientId, customerId, added!.lawsuit.id, who), null, 'ja removida');
    assert.ok(await repository.add(TEST_DATABASE_REF, clientId, customerId, { bank: 'BANCO PAN', processNumber: CNJ, identityId: who }), 'removida libera o numero');

    const listed = await repository.listForCustomer(TEST_DATABASE_REF, clientId, customerId);
    assert.deepEqual([listed.lawsuits.length, listed.declarations.length], [2, 1]);
    assert.deepEqual((await repository.listForCustomer(TEST_DATABASE_REF, randomUUID(), customerId)).lawsuits, [], 'outro tenant');
  }));

void test('PostgreSQL: desfazer a confirmacao fica no historico como withdrawn', () =>
  withTestDatabase(async (db) => {
    const repository = new PriorLawsuitsRepository(db);
    const clientId = randomUUID(), customerId = randomUUID(), who = randomUUID();
    assert.equal(await repository.withdraw(TEST_DATABASE_REF, clientId, customerId, who), false, 'nada para desfazer');
    await repository.declareNone(TEST_DATABASE_REF, clientId, customerId, who);
    assert.equal(await repository.withdraw(TEST_DATABASE_REF, clientId, customerId, who), true);
    const { declarations } = await repository.listForCustomer(TEST_DATABASE_REF, clientId, customerId);
    assert.deepEqual(declarations.map((row) => row.revokedReason), ['withdrawn']);
  }));

void test('situacao: marcacao padrao do cadastro aparece como declared_none com origem default', () => {
  const marked = {
    id: 'd1', declaredByIdentityId: 'u1', declaredAt: '2026-10-29T09:00:00Z',
    revokedAt: null, revokedByIdentityId: null, revokedReason: null, origin: 'default' as const
  };
  const result = buildPriorLawsuits('c1', [], [marked], new Map([['u1', 'Ana']]));
  assert.deepEqual([result.status, result.declaration?.origin, result.history[0].origin], ['declared_none', 'default', 'default']);
});

void test('PostgreSQL: cliente que chega ao Flow fica marcado "sem acoes"; quem ja mexeu na lista nao muda', () =>
  withTestDatabase(async (db, client) => {
    const repository = new PriorLawsuitsRepository(db);
    const clientId = randomUUID(), who = randomUUID();
    const fresh = randomUUID();
    assert.equal(await markDefaultNoPriorLawsuits(client as never, clientId, fresh, who), true);
    assert.equal(await markDefaultNoPriorLawsuits(client as never, clientId, fresh, who), false, 'repetir nao duplica');
    const marked = await repository.listForCustomer(TEST_DATABASE_REF, clientId, fresh);
    assert.deepEqual(marked.declarations.map((row) => [row.origin, row.revokedAt]), [['default', null]]);

    const withdrawn = randomUUID();
    await markDefaultNoPriorLawsuits(client as never, clientId, withdrawn, who);
    await repository.withdraw(TEST_DATABASE_REF, clientId, withdrawn, who);
    assert.equal(await markDefaultNoPriorLawsuits(client as never, clientId, withdrawn, who), false, 'desfeita nao volta sozinha');

    const listed = randomUUID();
    await repository.add(TEST_DATABASE_REF, clientId, listed, { bank: 'BANCO PAN', processNumber: CNJ, identityId: who });
    assert.equal(await markDefaultNoPriorLawsuits(client as never, clientId, listed, who), false, 'com acao listada');
  }));
