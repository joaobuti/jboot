import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from '../../test/with-test-database';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

// Garante que o formato de resposta da API de clientes (controller -> service -> repository)
// nao mudou com a separacao nucleo/customer_pdv (ADR 013).
const EXPECTED_SHAPE: Record<string, string> = {
  id: 'string',
  name: 'string',
  documentNumber: 'null',
  email: 'null',
  phone: 'null',
  addressZip: 'null',
  addressStreet: 'null',
  addressNumber: 'null',
  addressComplement: 'null',
  addressNeighborhood: 'null',
  addressCity: 'null',
  addressState: 'null',
  addressIbgeCode: 'null',
  ie: 'null',
  indIeDest: 'number',
  status: 'string',
  createdAt: 'object',
  updatedAt: 'object'
};

function shape(row: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, v === null ? 'null' : typeof v])
  );
}

const expected = Object.fromEntries(Object.entries(EXPECTED_SHAPE).sort(([a], [b]) => a.localeCompare(b)));
const audit = { record: async () => undefined } as never;
const ctx = {} as never;

void test('formato da resposta de clientes inalterado (create/update/list/findById)', () =>
  withTestDatabase(async (db) => {
    const service = new CustomersService(audit, new CustomersRepository(db));
    const clientId = randomUUID();

    const created = await service.create(clientId, { name: 'Shape' }, ctx);
    assert.deepEqual(shape(created), expected);

    const updated = await service.update(clientId, created.id, { name: 'Shape 2' }, ctx);
    assert.deepEqual(shape(updated), expected);

    const found = await service.findById(clientId, created.id);
    assert.ok(found);
    assert.deepEqual(shape(found), expected);

    const listed = await service.list(clientId, { limit: 10, offset: 0 });
    assert.deepEqual(Object.keys(listed).sort(), ['data', 'meta']);
    assert.deepEqual(Object.keys(listed.meta).sort(), ['limit', 'offset', 'total']);
    assert.deepEqual(shape(listed.data[0]), expected);

    const withFiscal = await service.update(clientId, created.id, { ie: '1', indIeDest: '1', addressIbgeCode: '3550308' }, ctx);
    assert.equal(typeof withFiscal.ie, 'string');
    assert.equal(typeof withFiscal.indIeDest, 'number');
    assert.equal(typeof withFiscal.addressIbgeCode, 'string');
    assert.deepEqual(Object.keys(withFiscal).sort(), Object.keys(expected));
  }, { database: 'pdv' }));
