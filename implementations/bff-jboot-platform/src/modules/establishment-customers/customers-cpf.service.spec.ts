import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from '../../test/with-test-database';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

// CPFs sinteticos (digitos verificadores validos, sem titular real).
const CPF_A = '52998224725';
const CPF_A_MASKED = '529.982.247-25';
const CPF_B = '11144477735';

const audit = { record: async () => undefined } as never;
const ctx = { clientId: 'ignored', identityId: randomUUID() } as never;

void test('findIdsByCpf compara so digitos, inclui valor legado com mascara, isola tenant e devolve so ids', () =>
  withTestDatabase(async (db, client) => {
    const service = new CustomersService(audit, new CustomersRepository(db));
    const clientId = randomUUID();
    const otherClientId = randomUUID();

    const digitsRow = await client.query<{ id: string }>(
      `INSERT INTO pdv_establishment_customers (client_id, name, document_number, created_at)
       VALUES ($1, 'Digits', $2, now() - interval '1 minute') RETURNING id`,
      [clientId, CPF_A]
    );
    const maskedRow = await client.query<{ id: string }>(
      `INSERT INTO pdv_establishment_customers (client_id, name, document_number, status)
       VALUES ($1, 'Masked', $2, 'inactive') RETURNING id`,
      [clientId, CPF_A_MASKED]
    );
    await client.query(
      `INSERT INTO pdv_establishment_customers (client_id, name, document_number) VALUES ($1, 'Other tenant', $2)`,
      [otherClientId, CPF_A]
    );

    const ids = await service.findIdsByCpf(clientId, CPF_A_MASKED);
    assert.deepEqual(ids, [digitsRow.rows[0].id, maskedRow.rows[0].id]);
    assert.ok(ids.every((id) => typeof id === 'string'));

    assert.deepEqual(await service.findIdsByCpf(clientId, CPF_B), []);
    assert.deepEqual(await service.findIdsByCpf(clientId, '123'), []);
    assert.equal((await service.findIdsByCpf(otherClientId, CPF_A)).length, 1);
  }, { database: 'pdv' }));

void test('createIfCpfAbsent cria com CPF so digitos e nao duplica (com ou sem mascara)', () =>
  withTestDatabase(async (db) => {
    const service = new CustomersService(audit, new CustomersRepository(db));
    const clientId = randomUUID();

    const first = await service.createIfCpfAbsent(clientId, CPF_A_MASKED, { name: 'Maria' }, ctx);
    assert.equal(first.created, true);
    assert.ok(first.created && first.id);
    const stored = await service.findById(clientId, first.created ? first.id : '');
    assert.equal(stored?.documentNumber, CPF_A);

    const second = await service.createIfCpfAbsent(clientId, CPF_A, { name: 'Maria de novo' }, ctx);
    assert.deepEqual(second, { created: false, existingIds: [first.created ? first.id : ''] });

    const listed = await service.list(clientId, { limit: 10, offset: 0 });
    assert.equal(listed.meta.total, 1);
  }, { database: 'pdv' }));

void test('createIfCpfAbsent converte corrida (violacao de unicidade) em retorno do existente', async () => {
  let lookups = 0;
  const repository = {
    findIdsByDocumentDigits: async () => (lookups++ === 0 ? [] : ['existing-1']),
    create: async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    }
  };
  const service = new CustomersService(audit, repository as never);
  const result = await service.createIfCpfAbsent('client-1', CPF_A, { name: 'Race' }, ctx);
  assert.deepEqual(result, { created: false, existingIds: ['existing-1'] });
  assert.equal(lookups, 2);
});

void test('createIfCpfAbsent propaga erro que nao e de unicidade', async () => {
  const repository = {
    findIdsByDocumentDigits: async () => [],
    create: async () => {
      throw new Error('boom');
    }
  };
  const service = new CustomersService(audit, repository as never);
  await assert.rejects(() => service.createIfCpfAbsent('client-1', CPF_A, { name: 'X' }, ctx), /boom/);
});

void test('discardJustCreated apaga so cliente do tenant e sem customer_pdv; customer_juridico sai por CASCADE', () =>
  withTestDatabase(async (db, client) => {
    const audited: unknown[] = [];
    const recordingAudit = { record: async (...args: unknown[]) => audited.push(args) } as never;
    const service = new CustomersService(recordingAudit, new CustomersRepository(db));
    const clientId = randomUUID();
    const otherClientId = randomUUID();

    const fresh = await service.createIfCpfAbsent(clientId, CPF_A, { name: 'Novo' }, ctx);
    assert.ok(fresh.created);
    const freshId = fresh.created ? fresh.id : '';
    await client.query(`INSERT INTO customer_juridico (customer_id, client_id, profissao) VALUES ($1, $2, 'x')`, [freshId, clientId]);

    // Outro tenant: recusa.
    assert.equal(await service.discardJustCreated(otherClientId, freshId, ctx), false);
    assert.ok(await service.findById(clientId, freshId));

    // Com dado de PDV: recusa (cliente em uso pelo PDV nunca e apagado).
    const withPdv = await service.createIfCpfAbsent(clientId, CPF_B, { name: 'PDV' }, ctx);
    const withPdvId = withPdv.created ? withPdv.id : '';
    await client.query(`INSERT INTO customer_pdv (customer_id, client_id, ie) VALUES ($1, $2, '1')`, [withPdvId, clientId]);
    assert.equal(await service.discardJustCreated(clientId, withPdvId, ctx), false);
    assert.ok(await service.findById(clientId, withPdvId));

    // Proprio tenant e sem customer_pdv: apaga, com auditoria; juridico vai junto.
    audited.length = 0;
    assert.equal(await service.discardJustCreated(clientId, freshId, ctx), true);
    assert.equal(await service.findById(clientId, freshId), null);
    const juridico = await client.query(`SELECT 1 FROM customer_juridico WHERE customer_id = $1`, [freshId]);
    assert.equal(juridico.rowCount, 0);
    assert.equal((audited[0] as unknown[])[0], 'pdv_customer_discarded');

    // CPF liberado: nova busca nao encontra, nova criacao funciona.
    assert.deepEqual(await service.findIdsByCpf(clientId, CPF_A), []);
    assert.equal((await service.createIfCpfAbsent(clientId, CPF_A, { name: 'Novo de novo' }, ctx)).created, true);
  }, { database: 'pdv' }));
