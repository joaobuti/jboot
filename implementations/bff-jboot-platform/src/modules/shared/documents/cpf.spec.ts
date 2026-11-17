import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validate } from 'class-validator';
import { IsCpf, isValidCpf, normalizeCpf } from './cpf';

// CPFs sinteticos com digitos verificadores validos (gerados para teste, sem titular real).
const VALID_DIGITS = '52998224725';
const VALID_MASKED = '529.982.247-25';

void test('normalizeCpf keeps only digits', () => {
  assert.equal(normalizeCpf(VALID_MASKED), VALID_DIGITS);
  assert.equal(normalizeCpf(' 529 982 247 25 '), VALID_DIGITS);
});

void test('isValidCpf accepts digits and the usual mask', () => {
  assert.equal(isValidCpf(VALID_DIGITS), true);
  assert.equal(isValidCpf(VALID_MASKED), true);
  assert.equal(isValidCpf('11144477735'), true);
});

void test('isValidCpf rejects wrong check digits, wrong length, repeated digits and garbage', () => {
  assert.equal(isValidCpf('52998224724'), false);
  assert.equal(isValidCpf('52998224715'), false);
  assert.equal(isValidCpf('5299822472'), false);
  assert.equal(isValidCpf('529982247250'), false);
  assert.equal(isValidCpf('11111111111'), false);
  assert.equal(isValidCpf('5299822472a'), false);
  assert.equal(isValidCpf('529/982/247-25'), false);
  assert.equal(isValidCpf(''), false);
  assert.equal(isValidCpf(52998224725), false);
  assert.equal(isValidCpf(null), false);
});

class Sample {
  @IsCpf()
  cpf!: string;
}

void test('IsCpf decorator validates and never echoes the value in the message', async () => {
  const ok = Object.assign(new Sample(), { cpf: VALID_MASKED });
  assert.equal((await validate(ok)).length, 0);

  const bad = Object.assign(new Sample(), { cpf: '52998224724' });
  const errors = await validate(bad);
  assert.equal(errors.length, 1);
  const message = Object.values(errors[0].constraints ?? {}).join(' ');
  assert.equal(message, 'cpf must be a valid CPF');
  assert.equal(message.includes('52998224724'), false);
});
