import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildTemplateData,
  findCatalogVariable,
  formatCep,
  formatCpf,
  formatDateBr,
  formatDateExtenso,
  formatFullAddress,
  formatPhone,
  isoDateInTimeZone,
  SYNTHETIC_TEMPLATE_SOURCE,
  TEMPLATE_CATALOG_VERSION,
  TEMPLATE_NAMESPACES,
  TEMPLATE_PATH_PATTERN,
  TEMPLATE_VARIABLE_CATALOG,
  templateCatalogResponse,
  TemplateDataSource
} from './template-variable-catalog';

void test('formatacao: CPF, CEP, telefone, datas e endereco', () => {
  assert.equal(formatCpf('12345678909'), '123.456.789-09');
  assert.equal(formatCpf('123.456.789-09'), '123.456.789-09');
  assert.equal(formatCpf(' 123 '), '123');
  assert.equal(formatCpf(null), null);
  assert.equal(formatCep('01001000'), '01001-000');
  assert.equal(formatPhone('11912345678'), '(11) 91234-5678');
  assert.equal(formatPhone('1133334444'), '(11) 3333-4444');
  assert.equal(formatPhone(''), null);
  assert.equal(formatDateBr('1960-03-05'), '05/03/1960');
  assert.equal(formatDateBr('2026-02-30'), null);
  assert.equal(formatDateBr('ontem'), null);
  assert.equal(formatDateExtenso('1960-03-05'), '5 de março de 1960');
  assert.equal(formatDateExtenso('2026-10-01'), '1º de outubro de 2026');
  // 02:30 UTC de 13/10 ainda e 12/10 em Brasilia.
  assert.equal(isoDateInTimeZone(new Date('2026-10-13T02:30:00Z')), '2026-10-12');
  assert.equal(isoDateInTimeZone(new Date('invalido')), null);
  const customer = { ...SYNTHETIC_TEMPLATE_SOURCE.customer, addressComplement: null, addressNeighborhood: '  ' };
  assert.equal(formatFullAddress(customer), 'Rua Exemplo, 100, Sao Paulo/SP, CEP 01001-000');
  assert.equal(formatFullAddress({ ...customer, addressStreet: null }), null);
});

void test('catalogo: chaves unicas na gramatica, namespaces conhecidos, versao gravavel', () => {
  const keys = TEMPLATE_VARIABLE_CATALOG.map((variable) => variable.key);
  assert.equal(new Set(keys).size, keys.length);
  const namespaces = new Set(TEMPLATE_NAMESPACES.map((namespace) => namespace.key));
  for (const key of keys) {
    assert.match(key, TEMPLATE_PATH_PATTERN);
    assert.equal(key.split('.').length, 2, `${key}: namespace.campo`);
    assert.ok(namespaces.has(key.split('.')[0]), key);
  }
  assert.ok(Number.isInteger(TEMPLATE_CATALOG_VERSION) && TEMPLATE_CATALOG_VERSION > 0);
  assert.equal(findCatalogVariable('cliente.cpf')?.valueType, 'text');
  assert.equal(findCatalogVariable('lead.casos')?.valueType, 'collection');
  assert.equal(findCatalogVariable('cliente.hipossuficiente')?.valueType, 'boolean');
  assert.equal(findCatalogVariable('cliente.observacoes'), null, 'observacao interna nao entra no documento');
});

void test('buildTemplateData: valores formatados; ausente vira null; casos numerados (P3)', () => {
  const data = buildTemplateData(SYNTHETIC_TEMPLATE_SOURCE);
  assert.equal(data.cliente.cpf, '123.456.789-09');
  assert.equal(data.cliente.telefone, '(11) 91234-5678');
  assert.equal(data.cliente.data_nascimento, '05/03/1960');
  assert.equal(data.cliente.hipossuficiente, true);
  assert.equal(data.escritorio.nome, 'Escritorio Exemplo');
  assert.deepEqual(data.lead.casos, [
    { ordem: '1', tipo: 'Tipo de caso exemplo A' },
    { ordem: '2', tipo: 'Tipo de caso exemplo B' }
  ]);
  assert.equal(data.lead.data_envio_extenso, '12 de outubro de 2026');
  assert.equal(data.data.hoje, '12/10/2026');

  const empty: TemplateDataSource = {
    ...SYNTHETIC_TEMPLATE_SOURCE,
    customer: { ...SYNTHETIC_TEMPLATE_SOURCE.customer, email: '   ', phone: null },
    juridico: null,
    office: null,
    lead: { submittedAt: null, cases: [] },
    currentCase: null
  };
  const blank = buildTemplateData(empty);
  assert.equal(blank.cliente.email, null);
  assert.equal(blank.cliente.data_nascimento, null);
  assert.equal(blank.cliente.hipossuficiente, false);
  assert.equal(blank.escritorio.nome, null);
  assert.deepEqual(blank.lead.casos, []);
  assert.equal(blank.caso.tipo, null);
});

void test('resposta do catalogo: uso pronto para colar e exemplo sintetico', () => {
  const response = templateCatalogResponse();
  assert.equal(response.catalogVersion, TEMPLATE_CATALOG_VERSION);
  assert.deepEqual(response.delimiters, { start: '{{', end: '}}' });
  const cliente = response.namespaces.find((namespace) => namespace.key === 'cliente');
  const cpf = cliente?.variables.find((variable) => variable.key === 'cliente.cpf');
  assert.deepEqual([cpf?.usage, cpf?.example], ['{{cliente.cpf}}', '123.456.789-09']);
  const hipo = cliente?.variables.find((variable) => variable.key === 'cliente.hipossuficiente');
  assert.equal(hipo?.usage, '{{#cliente.hipossuficiente}}...{{/cliente.hipossuficiente}}');
  const casos = response.namespaces.find((namespace) => namespace.key === 'lead')?.variables.find((variable) => variable.key === 'lead.casos');
  assert.equal(casos?.usage, '{{#lead.casos}}{{ordem}} {{tipo}}{{/lead.casos}}');
  assert.deepEqual(casos?.items?.map((item) => [item.key, item.example]), [
    ['ordem', '1'],
    ['tipo', 'Tipo de caso exemplo A']
  ]);
  const total = response.namespaces.reduce((sum, namespace) => sum + namespace.variables.length, 0);
  assert.equal(total, TEMPLATE_VARIABLE_CATALOG.length, 'toda variavel aparece em algum namespace');
});
