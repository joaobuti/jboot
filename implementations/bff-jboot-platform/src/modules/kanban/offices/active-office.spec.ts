import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { pickActiveOffice } from './active-office';
import { OfficeRow } from './offices.repository';

const office = (id: string, name: string, extra: Partial<OfficeRow> = {}): OfficeRow =>
  ({ id, name, active: true, city: null, uf: null, isPrincipal: false, createdAt: 't', updatedAt: 't', ...extra });

void test('escritorio ativo: escolhido (se ainda dele e ativo) -> principal -> primeiro por nome', () => {
  const manaus = office('m', 'Manaus');
  const chagas = office('c', 'Chagas & Salvador', { isPrincipal: true });
  const velho = office('v', 'Antigo', { active: false });
  assert.equal(pickActiveOffice([manaus, chagas], 'm'), 'm');
  assert.equal(pickActiveOffice([manaus, chagas], null), 'c', 'sem escolha: o principal');
  assert.equal(pickActiveOffice([manaus, office('x', 'Boa Vista')], null), 'x', 'sem principal: primeiro por nome');
  assert.equal(pickActiveOffice([manaus, velho], 'v'), 'm', 'escolha inativa nao vale');
  assert.equal(pickActiveOffice([manaus], 'outro'), 'm', 'escolha fora dos seus nao vale');
  assert.equal(pickActiveOffice([velho], null), null);
});
