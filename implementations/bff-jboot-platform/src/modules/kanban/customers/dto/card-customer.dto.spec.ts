import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ValidationPipe } from '@nestjs/common';
import { CardCustomerLookupDto, LinkCardCustomerDto, UpdateCardCustomerDto } from './card-customer.dto';

// Mesma configuracao global de src/main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function validateBody(metatype: new () => object, value: unknown): Promise<{ ok: boolean; messages: string[] }> {
  try {
    await pipe.transform(value, { type: 'body', metatype });
    return { ok: true, messages: [] };
  } catch (error) {
    const response = (error as { getResponse: () => { message: string[] } }).getResponse();
    return { ok: false, messages: response.message };
  }
}

void test('lookup aceita CPF valido com e sem mascara e rejeita invalido sem ecoar o valor', async () => {
  assert.equal((await validateBody(CardCustomerLookupDto, { cpf: '529.982.247-25' })).ok, true);
  assert.equal((await validateBody(CardCustomerLookupDto, { cpf: '52998224725' })).ok, true);
  const invalid = await validateBody(CardCustomerLookupDto, { cpf: '52998224724' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.messages.join(' ').includes('52998224724'), false);
  assert.equal((await validateBody(CardCustomerLookupDto, {})).ok, false);
});

void test('link rejeita campo fora da whitelist (ex.: client_id) e exige nome quando envia customer', async () => {
  const extra = await validateBody(LinkCardCustomerDto, { cpf: '52998224725', clientId: 'x' });
  assert.equal(extra.ok, false);
  const nested = await validateBody(LinkCardCustomerDto, { cpf: '52998224725', customer: { name: 'A', ie: '1' } });
  assert.equal(nested.ok, false, 'campo fiscal de PDV nao entra pelo Flow');
  const noName = await validateBody(LinkCardCustomerDto, { cpf: '52998224725', customer: { email: 'a@b.co' } });
  assert.equal(noName.ok, false);
  const ok = await validateBody(LinkCardCustomerDto, {
    cpf: '52998224725',
    customer: { name: 'Maria', addressState: 'SP' },
    juridico: { dataNascimento: '1980-01-02', hipossuficienciaDeclarada: true, rgUf: null }
  });
  assert.equal(ok.ok, true, ok.messages.join('; '));
});

void test('update rejeita null em dado geral, aceita null em juridico e valida formatos', async () => {
  assert.equal((await validateBody(UpdateCardCustomerDto, { customer: { email: null } })).ok, false);
  assert.equal((await validateBody(UpdateCardCustomerDto, { customer: { documentNumber: '1' } })).ok, false);
  assert.equal((await validateBody(UpdateCardCustomerDto, { juridico: { profissao: null } })).ok, true);
  assert.equal((await validateBody(UpdateCardCustomerDto, { juridico: { dataNascimento: '1980-02-31' } })).ok, false);
  assert.equal((await validateBody(UpdateCardCustomerDto, { juridico: { rgUf: 'sp' } })).ok, false);
  assert.equal((await validateBody(UpdateCardCustomerDto, { juridico: { hipossuficienciaDeclarada: null } })).ok, false);
});

void test('override: motivo obrigatorio, aparado, entre 10 e 500 caracteres; sem campo extra; sem ecoar o motivo', async () => {
  const base = { cpf: '52998224725' };
  assert.equal((await validateBody(LinkCardCustomerDto, { ...base, override: {} })).ok, false, 'sem motivo -> 400');
  assert.equal((await validateBody(LinkCardCustomerDto, { ...base, override: { reason: '          ' } })).ok, false, 'so espacos -> 400');
  assert.equal((await validateBody(LinkCardCustomerDto, { ...base, override: { reason: '  curto  ' } })).ok, false);
  assert.equal((await validateBody(LinkCardCustomerDto, { ...base, override: { reason: 'x'.repeat(501) } })).ok, false);
  assert.equal((await validateBody(LinkCardCustomerDto, { ...base, override: 'motivo em texto solto' })).ok, false);
  const extra = await validateBody(LinkCardCustomerDto, { ...base, override: { reason: 'Motivo suficiente', customerId: 'x' } });
  assert.equal(extra.ok, false, 'nao permite escolher id do cliente');
  const short = await validateBody(LinkCardCustomerDto, { ...base, override: { reason: 'segredo' } });
  assert.equal(short.ok, false);
  assert.equal(short.messages.join(' ').includes('segredo'), false);

  const transformed = (await pipe.transform(
    { ...base, override: { reason: '   Transferido da base de Campinas   ' } },
    { type: 'body', metatype: LinkCardCustomerDto }
  )) as LinkCardCustomerDto;
  assert.equal(transformed.override?.reason, 'Transferido da base de Campinas');
  assert.equal((await validateBody(LinkCardCustomerDto, { ...base, override: { reason: 'x'.repeat(500) } })).ok, true);
});
