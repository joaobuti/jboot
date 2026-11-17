import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TemplateVariableRow } from '../document-templates/document-templates.repository';
import { flattenLeadCustomer } from '../leads/lead-fields';
import { resolveGeneration, sourceFromSubmission, variableLabel } from './generation-data';

/** Snapshot sintetico no formato real do envio (`flattenLeadCustomer`), sem pessoa real. */
function snapshot(overrides: Record<string, unknown> = {}, juridico: Record<string, unknown> | null = {}) {
  return flattenLeadCustomer({
    core: {
      name: 'Cliente Sintetico',
      documentNumber: '52998224725',
      email: null,
      phone: '41999990000',
      addressZip: '80000000',
      addressStreet: 'Rua Sintetica',
      addressNumber: '10',
      addressComplement: null,
      addressNeighborhood: null,
      addressCity: 'Curitiba',
      addressState: 'PR',
      ...overrides
    },
    juridico: juridico === null ? null : { dataNascimento: '1960-03-05', hipossuficienciaDeclarada: true, ...juridico }
  });
}

const row = (key: string, required = true): TemplateVariableRow => ({ key, known: true, valueType: null, required, requiredUpdatedAt: null });

function inputs(snap: Record<string, unknown>) {
  return {
    snapshot: snap,
    submittedAt: '2026-10-12T13:00:00.000Z',
    officeName: 'Escritorio Sintetico',
    caseTypeNames: ['Tipo A', 'Tipo B'],
    currentCaseTypeName: 'Tipo B',
    today: new Date('2026-10-13T12:00:00.000Z')
  };
}

void test('fonte da geracao: cliente do snapshot do envio, escritorio atual, casos do ciclo e caso do documento', () => {
  const source = sourceFromSubmission(inputs(snapshot()));
  assert.equal(source.customer.name, 'Cliente Sintetico');
  assert.equal(source.customer.documentNumber, '52998224725');
  assert.equal(source.juridico?.dataNascimento, '1960-03-05');
  assert.equal(source.juridico?.hipossuficienciaDeclarada, true);
  assert.deepEqual(source.office, { name: 'Escritorio Sintetico' });
  assert.deepEqual(source.lead.cases, [{ caseTypeName: 'Tipo A' }, { caseTypeName: 'Tipo B' }]);
  assert.deepEqual(source.currentCase, { caseTypeName: 'Tipo B' });
});

void test('valores e origem de cada variavel do modelo (R7); item de colecao segue a colecao', () => {
  const resolved = resolveGeneration(sourceFromSubmission(inputs(snapshot())), [
    row('cliente.nome'),
    row('cliente.cpf'),
    row('cliente.data_nascimento_extenso'),
    row('escritorio.nome'),
    row('caso.tipo'),
    row('lead.casos'),
    row('lead.casos[].tipo'),
    row('lead.data_envio'),
    row('data.hoje'),
    row('cliente.hipossuficiente')
  ]);
  assert.deepEqual(resolved.missingRequired, []);
  const v = resolved.filledVariables;
  assert.deepEqual(v['cliente.nome'], { value: 'Cliente Sintetico', origin: 'cadastro_enviado', required: true, filled: true });
  assert.equal(v['cliente.cpf'].value, '529.982.247-25');
  assert.equal(v['cliente.data_nascimento_extenso'].value, '5 de março de 1960');
  assert.equal(v['escritorio.nome'].origin, 'escritorio');
  assert.equal(v['caso.tipo'].value, 'Tipo B');
  assert.equal(v['caso.tipo'].origin, 'caso');
  assert.deepEqual(v['lead.casos'].value, [
    { ordem: '1', tipo: 'Tipo A' },
    { ordem: '2', tipo: 'Tipo B' }
  ]);
  assert.equal(v['lead.data_envio'].value, '12/10/2026');
  assert.equal(v['data.hoje'].origin, 'sistema');
  assert.equal(v['cliente.hipossuficiente'].value, true);
  assert.equal(Object.prototype.hasOwnProperty.call(v, 'lead.casos[].tipo'), false);
  assert.equal(resolved.data.cliente.nome, 'Cliente Sintetico');
});

void test('R5: obrigatoria sem valor bloqueia (lista); opcional sem valor so e listada', () => {
  const resolved = resolveGeneration(sourceFromSubmission(inputs(snapshot({ email: null }, { nomeMae: null }))), [
    row('cliente.nome'),
    row('cliente.email', true),
    row('cliente.nome_mae', false),
    row('cliente.hipossuficiente', true)
  ]);
  assert.deepEqual(resolved.missingRequired, ['cliente.email']);
  assert.deepEqual(resolved.missingOptional, ['cliente.nome_mae']);
  assert.equal(resolved.filledVariables['cliente.email'].filled, false);
  // Booleano nunca "falta" (false e valor).
  assert.equal(resolved.filledVariables['cliente.hipossuficiente'].filled, true);
  assert.equal(variableLabel('cliente.email'), 'E-mail');
  assert.equal(variableLabel('x.y'), 'x.y');
});

void test('texto so com espacos conta como vazio; sem dado juridico o booleano e falso', () => {
  const resolved = resolveGeneration(sourceFromSubmission(inputs(snapshot({ name: '   ' }, null))), [
    row('cliente.nome'),
    row('cliente.hipossuficiente')
  ]);
  assert.deepEqual(resolved.missingRequired, ['cliente.nome']);
  assert.equal(resolved.filledVariables['cliente.hipossuficiente'].value, false);
});
