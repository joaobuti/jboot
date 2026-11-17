import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  changedLeadFields,
  DEFAULT_LEAD_REQUIRED_FIELDS,
  flattenLeadCustomer,
  isLeadFieldKey,
  LEAD_FIELD_KEYS,
  leadSnapshotHash,
  missingLeadFields,
  sortLeadFieldKeys
} from './lead-fields';

const core = {
  name: 'Maria',
  documentNumber: '52998224725',
  email: null,
  phone: '41999990000',
  addressZip: '80000000',
  addressStreet: 'Rua A',
  addressNumber: '10',
  addressComplement: null,
  addressNeighborhood: null,
  addressCity: 'Curitiba',
  addressState: 'PR',
  status: 'active'
};
const juridico = { dataNascimento: '1980-01-02', nomeMae: '  ', hipossuficienciaDeclarada: true, observacoes: null };

void test('catalogo: default P16 cabe na whitelist; CPF nao e configuravel', () => {
  for (const key of DEFAULT_LEAD_REQUIRED_FIELDS) {
    assert.ok(isLeadFieldKey(key), key);
  }
  assert.equal(isLeadFieldKey('documentNumber'), false);
  assert.equal(isLeadFieldKey('juridico.hipossuficienciaDeclarada'), false);
  assert.equal(isLeadFieldKey('status'), false);
  assert.deepEqual(sortLeadFieldKeys(['addressState', 'name', 'x']), ['name', 'addressState']);
  assert.equal(new Set(LEAD_FIELD_KEYS).size, LEAD_FIELD_KEYS.length);
});

void test('cadastro achatado: core + juridico + CPF; ausente vira null; campo fora do cadastro nao entra', () => {
  const flat = flattenLeadCustomer({ core, juridico });
  assert.equal(flat.name, 'Maria');
  assert.equal(flat.documentNumber, '52998224725');
  assert.equal(flat['juridico.dataNascimento'], '1980-01-02');
  assert.equal(flat['juridico.profissao'], null);
  assert.equal(flat['juridico.hipossuficienciaDeclarada'], true);
  assert.equal('status' in flat, false);
  assert.equal(flattenLeadCustomer({ core, juridico: null })['juridico.dataNascimento'], null);
});

void test('campos faltantes: nulo e texto em branco faltam; ordem do catalogo', () => {
  const flat = flattenLeadCustomer({ core, juridico });
  assert.deepEqual(missingLeadFields(flat, DEFAULT_LEAD_REQUIRED_FIELDS), []);
  assert.deepEqual(missingLeadFields(flat, ['juridico.nomeMae', 'email', 'addressNeighborhood', 'name']), [
    'email',
    'addressNeighborhood',
    'juridico.nomeMae'
  ]);
  assert.deepEqual(missingLeadFields(flattenLeadCustomer({ core, juridico: null }), DEFAULT_LEAD_REQUIRED_FIELDS), [
    'juridico.dataNascimento'
  ]);
});

void test('snapshot: hash estavel por conteudo (ordem de chave nao importa); diferenca so por nome de campo', () => {
  const flat = flattenLeadCustomer({ core, juridico });
  const reordered = Object.fromEntries(Object.entries(flat).reverse());
  assert.equal(leadSnapshotHash(flat), leadSnapshotHash(reordered));
  assert.match(leadSnapshotHash(flat), /^[0-9a-f]{64}$/);
  const changed = flattenLeadCustomer({ core: { ...core, addressStreet: 'Rua B' }, juridico });
  assert.notEqual(leadSnapshotHash(flat), leadSnapshotHash(changed));
  assert.deepEqual(changedLeadFields(flat, changed), ['addressStreet']);
  assert.deepEqual(changedLeadFields(flat, flat), []);
});
