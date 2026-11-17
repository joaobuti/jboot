import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CaptacaoService } from './captacao.service';

void test('CaptacaoService Excel export marks CPF and process number as text cells', () => {
  const service = new CaptacaoService({} as never);
  const serviceHarness = service as unknown as {
    buildExcelHtml(rows: unknown[]): string;
  };
  const html = serviceHarness.buildExcelHtml([
    {
      nome: 'Pessoa Teste',
      cpf: '00352984996',
      processNumber: '50074054520248240930',
      author: 'ELENIR BACK BONA',
      defendant: 'CREFISA SA CREDITO FINANCIAMENTO E INVESTIMENTOS',
      partiesText: 'AUTOR: ELENIR BACK BONA',
      subject: 'Tema',
      dataAutuacao: '2024-01-01',
    },
  ]);

  assert.match(html, /<td class="text-cell" style="mso-number-format:&quot;\\@&quot;;">00352984996<\/td>/);
  assert.match(html, /<td class="text-cell" style="mso-number-format:&quot;\\@&quot;;">50074054520248240930<\/td>/);
  assert.match(html, /50074054520248240930/);
});
