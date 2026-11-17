import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PetitionPreconditionsService, ufOf } from './petition-preconditions.service';

interface Setup {
  link?: boolean;
  validated?: boolean;
  addressState?: string | null;
  lawsuits?: Array<{ removedAt: string | null }>;
  declarations?: Array<{ revokedAt: string | null }>;
  officeId?: string | null;
  office?: { city: string | null; uf: string | null };
  signer?: boolean;
}

function build(setup: Setup = {}) {
  const signerCalls: string[] = [];
  const service = new PetitionPreconditionsService(
    { findByCard: async () => (setup.link === false ? null : { customerId: 'cust' }) } as never,
    { latestConfirmed: async () => (setup.validated === false ? null : { gender: 'masculino' }) } as never,
    {
      findById: async () => ({
        addressStreet: 'Rua A', addressNumber: '1', addressComplement: null, addressNeighborhood: 'Centro',
        addressCity: 'Manaus', addressState: setup.addressState === undefined ? 'am' : setup.addressState, addressZip: '69000-000'
      })
    } as never,
    { get: async () => ({ dataNascimento: '1950-01-01' }) } as never,
    {
      listForCustomer: async () => ({
        lawsuits: (setup.lawsuits ?? []).map((row, index) => ({ bank: `B${index}`, processNumber: `P${index}`, ...row })),
        declarations: setup.declarations ?? [{ revokedAt: null }]
      })
    } as never,
    { findByIdForClient: async () => ({ officeId: setup.officeId === undefined ? 'office-1' : setup.officeId }) } as never,
    {
      signerForCard: async (_r: string, _c: string, card: string, uf: string) => {
        signerCalls.push(`${card}:${uf}`);
        return setup.signer === false ? null : { identityId: 'adv-1', signatureName: 'Maria Souza', oabNumber: '12345', oabUf: uf, rank: 0 };
      }
    } as never,
    { findById: async () => ({ id: 'office-1', name: 'Manaus', active: true, ...(setup.office ?? { city: 'Manaus', uf: 'AM' }) }) } as never
  );
  return { evaluate: () => service.evaluate('ref', 'client', 'card'), signerCalls };
}

void test('pre-condicoes: cliente validado, UF da ficha e litispendencia declarada', async () => {
  assert.deepEqual(await build({ link: false }).evaluate().then((r) => (r.ok ? 'ok' : r.code)), 'card_without_customer');
  assert.deepEqual(await build({ validated: false }).evaluate().then((r) => (r.ok ? 'ok' : r.code)), 'customer_not_validated');
  assert.deepEqual(await build({ addressState: null }).evaluate().then((r) => (r.ok ? 'ok' : r.code)), 'customer_without_uf');
  assert.deepEqual(await build({ addressState: 'Amazonas' }).evaluate().then((r) => (r.ok ? 'ok' : r.code)), 'customer_without_uf');
  const missing = await build({ declarations: [{ revokedAt: 't' }], lawsuits: [{ removedAt: 't' }] }).evaluate();
  assert.equal(missing.ok ? 'ok' : missing.code, 'prior_lawsuits_missing', 'confirmacao revogada e acao removida nao contam');
  assert.match(missing.ok ? '' : missing.message, /acoes ja ajuizadas/);
});

void test('pre-condicoes atendidas: UF normalizada, acoes vigentes, local do escritorio e responsavel do card na UF', async () => {
  const { evaluate, signerCalls } = build({ lawsuits: [{ removedAt: null }, { removedAt: 't' }], declarations: [] });
  const result = await evaluate();
  assert.ok(result.ok);
  assert.equal(result.context.uf, 'AM');
  assert.deepEqual(result.context.priorLawsuits, { status: 'listed', lawsuits: [{ bank: 'B0', processNumber: 'P0' }] });
  assert.deepEqual(result.context.closing, {
    place: { city: 'Manaus', uf: 'AM' },
    signer: { identityId: 'adv-1', name: 'Maria Souza', oabNumber: '12345', oabUf: 'AM' },
    gaps: []
  });
  assert.deepEqual(signerCalls, ['card:AM']);
  assert.equal(result.context.birthDate, '1950-01-01');
});

void test('fecho incompleto nao bloqueia: o dado sai XXXX e a pendencia vai em closing.gaps', async () => {
  const none = await build({ signer: false }).evaluate();
  assert.ok(none.ok);
  assert.deepEqual([none.context.closing.signer, none.context.closing.gaps], [null, ['no_assignee_lawyer_for_uf']]);
  const noCity = await build({ office: { city: null, uf: null } }).evaluate();
  assert.ok(noCity.ok);
  assert.deepEqual([noCity.context.closing.place, noCity.context.closing.gaps], [null, ['office_without_city']]);
  const noOffice = await build({ officeId: null, signer: false }).evaluate();
  assert.ok(noOffice.ok);
  assert.deepEqual(noOffice.context.closing.gaps, ['card_without_office', 'no_assignee_lawyer_for_uf']);
  assert.equal(ufOf(' sc '), 'SC');
  assert.equal(ufOf('XX'), null);
});
