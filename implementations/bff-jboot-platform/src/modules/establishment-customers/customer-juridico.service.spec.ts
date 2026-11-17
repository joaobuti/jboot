import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { withTestDatabase } from '../../test/with-test-database';
import { CustomerJuridicoRepository } from './customer-juridico.repository';
import { CustomerJuridicoService } from './customer-juridico.service';
import { CustomersRepository } from './customers.repository';

const pdv = { database: 'pdv' as const };

void test('get devolve null sem dado juridico', () =>
  withTestDatabase(async (db) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const clientId = randomUUID();
    const customer = await new CustomersRepository(db).create(clientId, { name: 'Sem juridico' });
    assert.equal(await service.get(clientId, customer.id), null);
  }, pdv));

void test('save cria, depois atualiza parcialmente preservando campos omitidos e limpando null', () =>
  withTestDatabase(async (db) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const clientId = randomUUID();
    const customer = await new CustomersRepository(db).create(clientId, { name: 'Autor' });

    const created = await service.save(clientId, customer.id, {
      dataNascimento: '1980-05-17',
      nomeMae: 'Maria',
      estadoCivil: 'casado',
      hipossuficienciaDeclarada: true
    });
    assert.equal(created.customerId, customer.id);
    assert.equal(created.dataNascimento, '1980-05-17');
    assert.equal(created.nomeMae, 'Maria');
    assert.equal(created.hipossuficienciaDeclarada, true);
    assert.equal(created.profissao, null);

    const updated = await service.save(clientId, customer.id, { profissao: 'Pedreiro', estadoCivil: null });
    assert.equal(updated.profissao, 'Pedreiro');
    assert.equal(updated.estadoCivil, null);
    assert.equal(updated.nomeMae, 'Maria');
    assert.equal(updated.hipossuficienciaDeclarada, true);

    const noop = await service.save(clientId, customer.id, {});
    assert.equal(noop.profissao, 'Pedreiro');
    assert.deepEqual(await service.get(clientId, customer.id), noop);
  }, pdv));

void test('save em customer inexistente ou de outro tenant e rejeitado e nao grava', () =>
  withTestDatabase(async (db, client) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const customerA = await new CustomersRepository(db).create(tenantA, { name: 'De A' });

    await assert.rejects(() => service.save(tenantB, customerA.id, { nomeMae: 'invasor' }), NotFoundException);
    await assert.rejects(() => service.save(tenantA, randomUUID(), { nomeMae: 'fantasma' }), NotFoundException);
    const rows = await client.query('SELECT 1 FROM customer_juridico WHERE customer_id = $1', [customerA.id]);
    assert.equal(rows.rowCount, 0);
  }, pdv));

void test('get e save isolados por client_id: tenant B nao ve nem sobrescreve dado de A', () =>
  withTestDatabase(async (db) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const customerA = await new CustomersRepository(db).create(tenantA, { name: 'De A' });
    await service.save(tenantA, customerA.id, { nomeMae: 'Ana' });

    assert.equal(await service.get(tenantB, customerA.id), null);
    await assert.rejects(() => service.save(tenantB, customerA.id, { nomeMae: 'Beto' }), NotFoundException);
    assert.equal((await service.get(tenantA, customerA.id))?.nomeMae, 'Ana');
  }, pdv));

void test('rg_uf acima de 2 caracteres e recusado pelo banco', () =>
  withTestDatabase(async (db) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const clientId = randomUUID();
    const customer = await new CustomersRepository(db).create(clientId, { name: 'UF' });
    await assert.rejects(() => service.save(clientId, customer.id, { rgUf: 'SPX' }));
  }, pdv));

void test('fillEmpty preenche so campo vazio (ficha prevalece) e devolve os campos preenchidos', () =>
  withTestDatabase(async (db) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const clientId = randomUUID();
    const customer = await new CustomersRepository(db).create(clientId, { name: 'Autor' });

    // Sem linha juridica: tudo e preenchido.
    assert.deepEqual(await service.fillEmpty(clientId, customer.id, { nomeMae: 'Maria', dataNascimento: '1960-03-10' }), [
      'nomeMae',
      'dataNascimento'
    ]);
    await service.save(clientId, customer.id, { profissao: 'Pedreiro', rgNumero: '   ' });

    const applied = await service.fillEmpty(clientId, customer.id, {
      nomeMae: 'Outra',
      dataNascimento: '1970-01-01',
      profissao: 'Aposentado',
      rgNumero: '1234567',
      rgUf: 'AM'
    });
    assert.deepEqual(applied, ['rgNumero', 'rgUf'], 'campo em branco conta como vazio');
    const saved = await service.get(clientId, customer.id);
    assert.equal(saved?.nomeMae, 'Maria');
    assert.equal(saved?.dataNascimento, '1960-03-10');
    assert.equal(saved?.profissao, 'Pedreiro');
    assert.equal(saved?.rgNumero, '1234567');
    assert.equal(saved?.rgUf, 'AM');
    assert.equal(saved?.hipossuficienciaDeclarada, false);
    assert.deepEqual(await service.fillEmpty(clientId, customer.id, {}), []);
  }, pdv));

void test('fillEmpty em customer de outro tenant e rejeitado e nao grava', () =>
  withTestDatabase(async (db) => {
    const service = new CustomerJuridicoService(new CustomerJuridicoRepository(db));
    const customer = await new CustomersRepository(db).create(randomUUID(), { name: 'Autor' });
    await assert.rejects(() => service.fillEmpty(randomUUID(), customer.id, { nomeMae: 'Maria' }), NotFoundException);
  }, pdv));
