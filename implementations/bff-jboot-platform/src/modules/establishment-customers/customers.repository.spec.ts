import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { withTestDatabase } from '../../test/with-test-database';
import { CustomersRepository } from './customers.repository';

const pdv = { database: 'pdv' as const };
const page = { limit: 50, offset: 0 };

async function insertLegacyCustomer(client: Client, clientId: string, name: string, legacy?: { ie: string; ind: number; ibge: string }) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO pdv_establishment_customers (id, client_id, name, ie, ind_ie_dest, address_ibge_code)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, clientId, name, legacy?.ie ?? null, legacy?.ind ?? 9, legacy?.ibge ?? null]
  );
  return id;
}

void test('leitura sem linha auxiliar: ind_ie_dest 9 e ie/ibge nulos', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    const id = await insertLegacyCustomer(client, clientId, 'Sem aux');

    const found = await repo.findById(clientId, id);
    assert.ok(found);
    assert.equal(found.indIeDest, 9);
    assert.equal(found.ie, null);
    assert.equal(found.addressIbgeCode, null);

    const listed = await repo.list(clientId, page);
    assert.equal(listed.data[0].indIeDest, 9);
    assert.equal(listed.meta.total, 1);
  }, pdv));

void test('leitura com linha auxiliar e ignora colunas fiscais legadas do nucleo', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    const id = await insertLegacyCustomer(client, clientId, 'Com aux', { ie: 'LEGADO', ind: 2, ibge: '1111111' });
    await client.query(
      `INSERT INTO customer_pdv (customer_id, client_id, ie, ind_ie_dest, address_ibge_code) VALUES ($1, $2, '123456', 1, '3550308')`,
      [id, clientId]
    );

    const found = await repo.findById(clientId, id);
    assert.ok(found);
    assert.equal(found.ie, '123456');
    assert.equal(found.indIeDest, 1);
    assert.equal(found.addressIbgeCode, '3550308');
    assert.equal((await repo.list(clientId, page)).data[0].ie, '123456');
    assert.equal((await repo.findByDocumentOrPhone(clientId, { documentNumber: null, phone: null })), null);
  }, pdv));

void test('create grava nucleo + customer_pdv e nao toca colunas fiscais legadas', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    const created = await repo.create(clientId, { name: 'Novo', ie: '99', indIeDest: '1', addressIbgeCode: '3550308' });
    assert.equal(created.ie, '99');
    assert.equal(created.indIeDest, 1);
    assert.equal(created.addressIbgeCode, '3550308');

    const legacy = await client.query(
      'SELECT ie, ind_ie_dest, address_ibge_code FROM pdv_establishment_customers WHERE id = $1',
      [created.id]
    );
    assert.deepEqual(legacy.rows[0], { ie: null, ind_ie_dest: 9, address_ibge_code: null });
    const aux = await client.query('SELECT client_id FROM customer_pdv WHERE customer_id = $1', [created.id]);
    assert.equal(aux.rows[0].client_id, clientId);
  }, pdv));

void test('create sem campos fiscais nao cria linha auxiliar; update cria e depois preserva campos omitidos', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    const created = await repo.create(clientId, { name: 'Basico' });
    assert.equal(created.indIeDest, 9);
    const none = await client.query('SELECT 1 FROM customer_pdv WHERE customer_id = $1', [created.id]);
    assert.equal(none.rowCount, 0);

    const u1 = await repo.update(clientId, created.id, { ie: 'ABC', indIeDest: '1' });
    assert.equal(u1.ie, 'ABC');
    assert.equal(u1.indIeDest, 1);

    const u2 = await repo.update(clientId, created.id, { name: 'Renomeado', addressIbgeCode: '3550308' });
    assert.equal(u2.name, 'Renomeado');
    assert.equal(u2.ie, 'ABC');
    assert.equal(u2.indIeDest, 1);
    assert.equal(u2.addressIbgeCode, '3550308');

    const u3 = await repo.update(clientId, created.id, { status: 'inactive' });
    assert.equal(u3.ie, 'ABC');
    assert.equal(u3.status, 'inactive');
  }, pdv));

void test('escrita atomica: falha no customer_pdv desfaz o nucleo', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    // ie com 21 caracteres viola varchar(20) apenas em customer_pdv (o nucleo ja foi inserido).
    await assert.rejects(() => repo.create(clientId, { name: 'Falha', ie: 'x'.repeat(21) }));
    const core = await client.query('SELECT 1 FROM pdv_establishment_customers WHERE client_id = $1', [clientId]);
    assert.equal(core.rowCount, 0);

    const existing = await repo.create(clientId, { name: 'Existente', ie: '1' });
    await assert.rejects(() => repo.update(clientId, existing.id, { name: 'Mudou', ie: 'x'.repeat(21) }));
    const after = await repo.findById(clientId, existing.id);
    assert.equal(after?.name, 'Existente');
    assert.equal(after?.ie, '1');
  }, pdv));

void test('isolamento por client_id em leitura e escrita', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const a = randomUUID();
    const b = randomUUID();
    const ca = await repo.create(a, { name: 'A', ie: 'A1' });
    assert.equal(await repo.findById(b, ca.id), null);
    assert.equal((await repo.list(b, page)).data.length, 0);
    await assert.rejects(() => repo.update(b, ca.id, { name: 'invasor', ie: 'B1' }));
    const aux = await client.query('SELECT ie FROM customer_pdv WHERE customer_id = $1', [ca.id]);
    assert.equal(aux.rows[0].ie, 'A1');
    assert.equal((await repo.findById(a, ca.id))?.name, 'A');
  }, pdv));

void test('findOrCreate publico: createPublic devolve o formato com default fiscal', () =>
  withTestDatabase(async (db) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    const created = await repo.createPublic(clientId, { name: 'Cliente 11', phone: '11999990000' });
    assert.equal(created.indIeDest, 9);
    const found = await repo.findByDocumentOrPhone(clientId, { phone: '11999990000' });
    assert.equal(found?.id, created.id);
    assert.equal(await repo.findByDocumentOrPhone(randomUUID(), { phone: '11999990000' }), null);
  }, pdv));

void test('banco rejeita linha auxiliar com client_id diferente do nucleo (customer_pdv e customer_juridico)', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const owner = randomUUID();
    const other = randomUUID();
    const created = await repo.create(owner, { name: 'Dono' });

    for (const table of ['customer_pdv', 'customer_juridico']) {
      await assert.rejects(
        () => db.transaction((tx) => tx.query(`INSERT INTO ${table} (customer_id, client_id) VALUES ($1, $2)`, [created.id, other])),
        (error: { code?: string }) => error.code === '23503'
      );
      const rows = await client.query(`SELECT 1 FROM ${table} WHERE customer_id = $1`, [created.id]);
      assert.equal(rows.rowCount, 0);
    }
    // mesmo client_id continua aceito
    await db.transaction((tx) => tx.query('INSERT INTO customer_pdv (customer_id, client_id) VALUES ($1, $2)', [created.id, owner]));
  }, pdv));

void test('endereco da validacao do Flow: o documento substitui o endereco inteiro da ficha', () =>
  withTestDatabase(async (db, client) => {
    const repo = new CustomersRepository(db);
    const clientId = randomUUID();
    const id = await insertLegacyCustomer(client, clientId, 'Com endereco antigo');
    await client.query(
      `UPDATE pdv_establishment_customers
       SET address_street = 'Rua Velha', address_number = '9', address_complement = 'Casa 2', address_city = 'Parintins', address_state = 'AM'
       WHERE id = $1`,
      [id]
    );
    const address = { addressZip: '69015-330', addressStreet: 'Avenida Israel', addressNumber: '9', addressCity: 'Manaus', addressState: 'AM' };
    assert.deepEqual(
      await repo.replaceAddressFromDocument(clientId, id, address),
      ['addressZip', 'addressStreet', 'addressComplement', 'addressCity'],
      'so os campos que mudaram; complemento que o documento nao traz fica vazio'
    );
    const saved = await repo.findById(clientId, id);
    assert.deepEqual(
      [saved?.addressStreet, saved?.addressNumber, saved?.addressComplement, saved?.addressCity, saved?.addressZip],
      ['Avenida Israel', '9', null, 'Manaus', '69015-330']
    );
    assert.deepEqual(await repo.replaceAddressFromDocument(clientId, id, address), [], 'mesmo endereco: nada muda');
    assert.deepEqual(await repo.replaceAddressFromDocument(clientId, id, { addressCity: 'Manaus', addressState: 'AM' }), [], 'sem logradouro nao toca a ficha');
    assert.equal((await repo.findById(clientId, id))?.addressStreet, 'Avenida Israel');
    assert.deepEqual(await repo.replaceAddressFromDocument(randomUUID(), id, address), [], 'outro tenant');
  }, pdv));
