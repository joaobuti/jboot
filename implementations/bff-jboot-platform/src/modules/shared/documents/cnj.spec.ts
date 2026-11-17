import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatCnj, inferCnjTribunal, normalizeCnj } from './cnj';

// Numeros sinteticos com digito verificador calculado (mod 97); nenhum identifica processo real.
function withCheckDigit(n: string, year: string, j: string, tr: string, origin: string): string {
  const base = `${n}${year}${j}${tr}${origin}00`;
  let remainder = 0;
  for (const digit of base) remainder = (remainder * 10 + Number(digit)) % 97;
  return `${n}${String(98 - remainder).padStart(2, '0')}${year}${j}${tr}${origin}`;
}

const TJSP = withCheckDigit('0000001', '2026', '8', '26', '0100');

void test('normalizeCnj aceita digitos ou mascara completa com digito verificador correto', () => {
  assert.equal(normalizeCnj(TJSP), TJSP);
  assert.equal(normalizeCnj(formatCnj(TJSP)), TJSP);
  assert.equal(normalizeCnj(` ${TJSP} `), TJSP);
});

void test('normalizeCnj recusa digito verificador errado, tamanho errado e mascara parcial', () => {
  const wrong = `${TJSP.slice(0, 7)}${TJSP[7] === '0' ? '1' : '0'}${TJSP.slice(8)}`;
  assert.equal(normalizeCnj(wrong), null);
  assert.equal(normalizeCnj(TJSP.slice(1)), null);
  assert.equal(normalizeCnj(`${TJSP.slice(0, 7)}-${TJSP.slice(7)}`), null);
  assert.equal(normalizeCnj(undefined), null);
});

void test('inferCnjTribunal usa o segmento J.TR', () => {
  assert.equal(inferCnjTribunal(TJSP), 'TJSP');
  assert.equal(inferCnjTribunal(withCheckDigit('0000002', '2026', '4', '03', '6100')), 'TRF3');
  assert.equal(inferCnjTribunal(withCheckDigit('0000003', '2026', '8', '99', '0001')), null);
});
