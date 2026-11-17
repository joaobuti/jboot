import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { maskPersonalData } from './personal-data-mask';

void describe('maskPersonalData', () => {
  void it('hides CPF, CNPJ, e-mail and phone in free text', () => {
    const text = 'Cliente CPF 000.000.001-91 ou 00000000191, empresa 63.784.101/0001-10, joao@exemplo.com.br, fone (41) 99876-5432';
    const masked = maskPersonalData(text);
    assert.doesNotMatch(masked, /051\.030|00000000191|63\.784|joao@|99876/);
    for (const label of ['[CPF oculto]', '[CNPJ oculto]', '[e-mail oculto]', '[telefone oculto]']) {
      assert.ok(masked.includes(label), label);
    }
  });

  void it('keeps ordinary text, dates and short numbers', () => {
    const text = 'Prazo 15/10/2026, processo com 3 volumes e valor 1500';
    assert.equal(maskPersonalData(text), text);
  });
});
