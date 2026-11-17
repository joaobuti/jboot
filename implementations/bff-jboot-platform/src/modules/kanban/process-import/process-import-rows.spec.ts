import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeState, validateRows } from './process-import-rows';

// Dados ficticios: CPFs sinteticos com digito verificador valido e numeros CNJ calculados (mod 97).
// Nunca usar CPF, nome ou processo de planilha real de cliente.
const CPF_A = '52998224725';
const CPF_B = '11144477735';
function cnj(sequence: string, j = '4', tr = '01'): string {
  const n = sequence.padStart(7, '0');
  const tail = `2026${j}${tr}4200`;
  let remainder = 0;
  for (const digit of `${n}${tail}00`) remainder = (remainder * 10 + Number(digit)) % 97;
  return `${n}${String(98 - remainder).padStart(2, '0')}${tail}`;
}
const masked = (d: string) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16)}`;

void test('linha valida: CPF e CNJ normalizados, tribunal pelo numero, STATUS limpo', () => {
  const [row] = validateRows([{ line: 2, name: '  Maria  de Teste ', cpf: '529.982.247-25', processNumber: masked(cnj('1')), state: 'TRF1', situation: ' REPLICA 30/06 ' }]);
  assert.deepEqual(row, {
    line: 2, name: 'Maria de Teste', cpf: CPF_A, processNumber: cnj('1'), tribunal: 'TRF1',
    situation: 'REPLICA 30/06', problems: [], warnings: []
  });
});

void test('problemas por linha: nome, CPF, CNJ, tribunal sem indice e numero repetido na planilha', () => {
  const rows = validateRows([
    { line: 2, name: '', cpf: CPF_A, processNumber: cnj('1') },
    { line: 3, name: 'B', cpf: '123', processNumber: cnj('2') },
    { line: 4, name: 'C', cpf: CPF_B, processNumber: '0000001-00.2026.4.01.4200' },
    { line: 5, name: 'D', cpf: CPF_B, processNumber: cnj('3', '8', '99') },
    { line: 6, name: 'E', cpf: CPF_B, processNumber: cnj('2') }
  ]);
  assert.deepEqual(rows.map((row) => row.problems), [
    ['name_missing'], ['cpf_invalid'], ['process_number_invalid'], ['process_number_tribunal_unknown'], ['duplicate_in_sheet']
  ]);
});

void test('avisos: ESTADO diferente do tribunal e mesmo CPF com nomes diferentes na planilha', () => {
  const rows = validateRows([
    { line: 2, name: 'Ana', cpf: CPF_A, processNumber: cnj('1'), state: 'TJSP' },
    { line: 3, name: 'ANA', cpf: CPF_A, processNumber: cnj('2'), state: 'trf 1' },
    { line: 4, name: 'Outra', cpf: CPF_A, processNumber: cnj('3') }
  ]);
  assert.deepEqual(rows.map((row) => row.warnings), [['state_mismatch'], [], ['cpf_name_differs_in_sheet']]);
  assert.equal(normalizeState('TJ-SP'), 'TJSP');
  assert.equal(normalizeState(''), null);
});
