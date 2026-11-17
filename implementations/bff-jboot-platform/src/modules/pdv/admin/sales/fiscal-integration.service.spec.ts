import { afterEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FiscalIntegrationService } from './fiscal-integration.service';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

const baseParams = {
  requestId: '11111111-1111-4111-8111-111111111111',
  clientId: 'tenant-1',
  cnpjEmitente: '00000000000000',
  emitente: {
    cnpj: '00000000000000', razaoSocial: 'EMITENTE HOMOLOGACAO', ie: '000000000000', uf: 'SP', crt: 1,
    endereco: { logradouro: 'Rua Teste', numero: '1', bairro: 'Centro', municipio: 'Sorocaba', uf: 'SP', cep: '18000000', codigoMunicipio: '3552205' },
  },
  items: [{
    id: 'item-1', saleId: 'sale-1', productId: 'product-1', sku: 'HOMOLOG-001',
    description: 'PARAFUSO DE ACO PARA TESTE EM HOMOLOGACAO', unit: 'UN', gtin: null,
    cest: null, ncm: '73181500', cfop: '5102', quantity: '1', unitPrice: '1.00', discount: '0', total: '1.00',
  }],
  payments: [{ id: 'payment-1', saleId: 'sale-1', paymentMethod: 'pix' as const, amount: '1.00', status: 'confirmed', externalRef: 'charge-1' }],
  total: 1,
};

void test('sends immutable item data and idempotency key to fiscal service', async () => {
  let captured: RequestInit | undefined;
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ fiscal_document_id: 'doc-1', status: 'authorized', chave_acesso: '1'.repeat(44) }), { status: 201 });
  }) as typeof fetch;

  const service = new FiscalIntegrationService(
    { fiscalServiceUrl: 'http://fiscal' } as never,
    { mint: async () => 'service-token' } as never,
  );
  const result = await service.emitirNfce(baseParams);

  const headers = captured?.headers as Record<string, string>;
  const body = JSON.parse(String(captured?.body));
  assert.equal(headers['Idempotency-Key'], baseParams.requestId);
  assert.equal(body.dados_documento.itens[0].descricao, baseParams.items[0].description);
  assert.equal(body.dados_documento.itens[0].ncm, '73181500');
  assert.equal(body.dados_documento.pagamentos[0].forma_pagamento, 17);
  assert.equal(result.status, 'authorized');
});

void test('does not map HTTP 200 rejected result to authorized', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    fiscal_document_id: 'doc-1', status: 'rejected', error: 'sefaz_rejection', sefaz_motivo: 'Rejeitado',
  }), { status: 200 })) as typeof fetch;

  const service = new FiscalIntegrationService(
    { fiscalServiceUrl: 'http://fiscal' } as never,
    { mint: async () => 'service-token' } as never,
  );
  const result = await service.emitirNfce(baseParams);
  assert.equal(result.status, 'failed');
});

void test('classifies transport failure as uncertain for safe reconciliation', async () => {
  global.fetch = (async () => { throw new Error('timeout'); }) as typeof fetch;
  const service = new FiscalIntegrationService(
    { fiscalServiceUrl: 'http://fiscal' } as never,
    { mint: async () => 'service-token' } as never,
  );
  const result = await service.emitirNfce(baseParams);
  assert.equal(result.status, 'uncertain');
});

