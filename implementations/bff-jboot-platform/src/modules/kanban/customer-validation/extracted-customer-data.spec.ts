import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeExtractedData } from './extracted-customer-data';

// Orgao emissor do RG modelo novo, como veio da rotina no teste real (2026-10-28).
const RG_NOVO = 'Instituto de Identificacao Aderson Conceicao de Melo/AM';

void test('aceita o orgao emissor do RG modelo novo', () => {
  const result = normalizeExtractedData({ rgOrgaoEmissor: RG_NOVO });
  assert.deepEqual(result.data, { rgOrgaoEmissor: RG_NOVO });
  assert.deepEqual(result.discarded, []);
});

void test('orgao emissor acima de 120 caracteres e descartado, nunca truncado', () => {
  assert.deepEqual(normalizeExtractedData({ rgOrgaoEmissor: 'X'.repeat(120) }).data, { rgOrgaoEmissor: 'X'.repeat(120) });
  const result = normalizeExtractedData({ rgOrgaoEmissor: 'X'.repeat(121) });
  assert.deepEqual(result.data, {});
  assert.deepEqual(result.discarded, ['rgOrgaoEmissor']);
});

void test('endereco do comprovante: CEP formatado, UF em maiuscula e texto limpo', () => {
  const result = normalizeExtractedData({
    addressZip: '69.058 830',
    addressStreet: '  Rua   Exemplo  ',
    addressNumber: '10',
    addressNeighborhood: 'Centro',
    addressCity: 'Manaus',
    addressState: 'am'
  });
  assert.deepEqual(result.address, {
    addressZip: '69058-830',
    addressStreet: 'Rua Exemplo',
    addressNumber: '10',
    addressNeighborhood: 'Centro',
    addressCity: 'Manaus',
    addressState: 'AM'
  });
  assert.deepEqual(result.data, {});
  assert.deepEqual(result.discarded, []);
});

void test('endereco: UF invalida, CEP sem 8 digitos e campo acima de 60 sao descartados', () => {
  const result = normalizeExtractedData({ addressState: 'Amazonas', addressZip: '6905', addressStreet: 'X'.repeat(61), addressCity: 'Manaus' });
  assert.deepEqual(result.address, { addressCity: 'Manaus' });
  assert.deepEqual(result.discarded, ['addressZip', 'addressStreet', 'addressState']);
});
