import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractServiceContractTags, isBlankServiceContract, sanitizeServiceContractHtml } from './service-contract-content';

void test('contrato: limpeza remove script, eventos, estilo livre e iframe e mantem o HTML do Quill', () => {
  const html = sanitizeServiceContractHtml(
    '<p class="ql-align-justify" style="color:red" onclick="x()">Texto <strong>forte</strong><script>alert(1)</script></p>' +
      '<iframe src="https://evil"></iframe><img src=x onerror="alert(1)">' +
      '<ol><li data-list="bullet" class="ql-indent-1"><span class="ql-ui" contenteditable="false"></span>item</li></ol>' +
      '<p><a href="javascript:alert(1)">ruim</a> <a href="https://jboot.com.br">bom</a></p><h2 class="evil">Titulo</h2>'
  );
  assert.equal(html.includes('script'), false);
  assert.equal(html.includes('onclick'), false);
  assert.equal(html.includes('style='), false);
  assert.equal(html.includes('iframe'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('javascript:'), false);
  assert.ok(html.includes('<p class="ql-align-justify">Texto <strong>forte</strong></p>'));
  assert.ok(html.includes('<li data-list="bullet" class="ql-indent-1"><span class="ql-ui"></span>item</li>'));
  assert.ok(html.includes('<a href="https://jboot.com.br" target="_blank" rel="noopener noreferrer">bom</a>'));
  assert.ok(html.includes('<h2>Titulo</h2>'));
});

void test('contrato: tags detectadas no texto, mesmo com formatacao no meio, sem repeticao', () => {
  const { tags, invalidTags } = extractServiceContractTags(
    '<p>De um lado, [[NOME_COMPLETO]], [[<strong>NACIONALIDADE</strong>]], inscrito no CPF [[CPF]].</p>' +
      '<p>Residente na [[ENDERECO_COMPLETO]]; CPF [[CPF]]; [[nome completo]] e [[ ESTADO_CIVIL ]].</p>'
  );
  assert.deepEqual(tags, ['NOME_COMPLETO', 'NACIONALIDADE', 'CPF', 'ENDERECO_COMPLETO']);
  assert.deepEqual(invalidTags, ['[[nome completo]]', '[[ ESTADO_CIVIL ]]']);
});

void test('contrato: tag nao atravessa paragrafos e editor vazio do Quill conta como vazio', () => {
  assert.deepEqual(extractServiceContractTags('<p>[[CPF</p><p>]]</p>').tags, []);
  assert.equal(isBlankServiceContract('<p><br></p>'), true);
  assert.equal(isBlankServiceContract('<p>&nbsp;</p>'), true);
  assert.equal(isBlankServiceContract('<p>Contrato</p>'), false);
});

void test('contrato: tabela do Quill 2 e mantida e cada celula conta como trecho proprio na deteccao de tags', () => {
  const html = sanitizeServiceContractHtml(
    '<table style="width:100%"><tbody><tr><td data-row="row-a" style="background:#eee" onclick="x()"><strong>Banco</strong></td>' +
      '<td data-row="row-a">Contrato</td></tr><tr><td data-row="row-b">[[BANCO_1]]</td><td data-row="row-b">[[CONTRATO_1]]</td></tr></tbody></table>'
  );
  assert.equal(
    html,
    '<table><tbody><tr><td data-row="row-a"><strong>Banco</strong></td><td data-row="row-a">Contrato</td></tr>' +
      '<tr><td data-row="row-b">[[BANCO_1]]</td><td data-row="row-b">[[CONTRATO_1]]</td></tr></tbody></table>'
  );
  assert.deepEqual(extractServiceContractTags(html).tags, ['BANCO_1', 'CONTRATO_1']);
  assert.deepEqual(extractServiceContractTags('<table><tbody><tr><td>[[A</td><td>B]]</td></tr></tbody></table>').tags, []);
});
