import { strict as assert } from 'node:assert';
import { afterEach, test } from 'node:test';
import { FiscalConfigService } from './fiscal-config.service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

void test('FiscalConfigService.listConfigs maps fiscal service snake_case response to BFF camelCase contract', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify([
        {
          cnpj_emitente: '63784101000110',
          ambiente: 'homologacao',
          razao_social: 'EMITENTE HOMOLOGACAO',
          nome_fantasia: null,
          inscricao_estadual: '000000000000',
          telefone: null,
          email: null,
          address_logradouro: 'Rua Teste',
          address_numero: '1',
          address_complemento: null,
          address_bairro: 'Centro',
          address_municipio: 'Sorocaba',
          address_uf: 'SP',
          address_cep: '18000000',
          address_codigo_municipio: '3552205',
          serie_nfce: 1,
          serie_nfe: 1,
          csc_configured: true,
          csc_id: '000001',
          regime_fiscal: 'simples',
          cfop_padrao_nfce: '5102',
          cfop_padrao_nfe: '5102',
          icms_origem_padrao: 0,
          icms_cst_padrao: '102',
          icms_aliquota_padrao: 18,
          pis_cst_padrao: '07',
          pis_aliquota_padrao: 1.65,
          cofins_cst_padrao: '07',
          cofins_aliquota_padrao: 7.6
        }
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const service = new FiscalConfigService(
    { fiscalServiceUrl: 'http://fiscal.test' } as never,
    { mint: async () => 's2s-token' } as never
  );

  const result = await service.listConfigs('client-1');

  assert.deepEqual(result, [
    {
      id: '63784101000110',
      clientId: '',
      cnpjEmitente: '63784101000110',
      ambiente: 'homologacao',
      razaoSocial: 'EMITENTE HOMOLOGACAO',
      nomeFantasia: null,
      inscricaoEstadual: '000000000000',
      telefone: null,
      email: null,
      logradouro: 'Rua Teste',
      numero: '1',
      complemento: null,
      bairro: 'Centro',
      municipio: 'Sorocaba',
      uf: 'SP',
      cep: '18000000',
      codigoMunicipio: '3552205',
      serieNfce: 1,
      serieNfe: 1,
      cscConfigured: true,
      cscId: '000001',
      regimeFiscal: 'simples',
      cfopPadraoNfce: '5102',
      cfopPadraoNfe: '5102',
      icmsOrigemPadrao: 0,
      icmsCstPadrao: '102',
      icmsAliquotaPadrao: 18,
      pisCstPadrao: '07',
      pisAliquotaPadrao: 1.65,
      cofinsCstPadrao: '07',
      cofinsAliquotaPadrao: 7.6
    }
  ]);
  assert.equal(calls[0]?.url, 'http://fiscal.test/api/v1/config');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer s2s-token');
});

void test('FiscalConfigService.uploadCertificate proxies certificate payload with s2s token', async () => {
  let capturedBody: unknown = null;
  let capturedHeaders = new Headers();

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ status: 'active' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  const service = new FiscalConfigService(
    { fiscalServiceUrl: 'http://fiscal.test' } as never,
    { mint: async () => 's2s-token' } as never
  );

  const result = await service.uploadCertificate(
    {
      cnpjEmitente: '63784101000110',
      ambiente: 'homologacao',
      pfxBase64: 'base64-pfx',
      pfxPassword: 'secret'
    },
    'client-1'
  );

  assert.deepEqual(capturedBody, {
    cnpj_emitente: '63784101000110',
    ambiente: 'homologacao',
    pfx_base64: 'base64-pfx',
    pfx_password: 'secret'
  });
  assert.equal(capturedHeaders.get('Authorization'), 'Bearer s2s-token');
  assert.deepEqual(result, { status: 'active' });
});
