import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { addBusinessDays, courtChanges, lookupWindow, movementMayHaveCommunication, publicationExcerpt, publicationText, todayInBrasilia } from './process-publications';

// Estrutura real do HTML do DJEN (comunicacao do TRF4 capturada em 2026-11-08 pela API publica
// comunicaapi.pje.jus.br, processo 5013400-76.2026.4.04.7003), com nomes anonimizados.
const DJEN_HTML = `<html> <head> <meta> <style>body{color:red}</style> </head> <body> <article> <header> <div></div> </header>
<section><b>PROCEDIMENTO DO JUIZADO ESPECIAL C&Iacute;VEL  N&ordm; 5013400-76.2026.4.04.7003/PR</b></section>
<section><b><table><tr><td>AUTOR</td><td>: FULANO DE TAL</td></tr><tr><td>ADVOGADO(A)</td><td>: BELTRANO (OAB PR000000)</td></tr></table></b></section>
<section><p>Intime-se a parte autora &amp; cumpra-se.</p></section></article></body></html>`;

void test('texto puro do DJEN: sem estilo, entidades decodificadas, quebras nos blocos', () => {
  const text = publicationText(DJEN_HTML);
  assert.doesNotMatch(text, /[<>]/);
  assert.doesNotMatch(text, /color:red/);
  assert.match(text, /PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL N.º? ?5013400|PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL Nº 5013400/);
  assert.match(text, /AUTOR : FULANO DE TAL/);
  assert.match(text, /Intime-se a parte autora & cumpra-se\./);
  assert.ok(text.split('\n').length >= 3);
  assert.equal(publicationText(null), '');
});

void test('script nunca chega ao texto', () => {
  assert.equal(publicationText('<p>ok</p><script>alert(1)</script><img src=x onerror=alert(2)>'), 'ok');
});

void test('trecho limita o tamanho', () => {
  assert.equal(publicationExcerpt('a '.repeat(500), 20).length, 20);
});

void test('dias uteis pulam o fim de semana; hoje em Brasilia', () => {
  assert.equal(addBusinessDays('2026-11-06', 1), '2026-11-09');
  assert.equal(addBusinessDays('2026-11-09', 3), '2026-11-12');
  assert.equal(addBusinessDays('2026-11-06', 7), '2026-11-17');
  assert.equal(todayInBrasilia(Date.parse('2026-11-09T02:00:00Z')), '2026-11-08');
});

void test('mudanca de vara: um item so na troca, ligado a movimentacao que a revelou', () => {
  const court = (nome: string) => ({ codigo: '1', nome });
  const changes = courtChanges('k', [
    { dataHora: '2026-07-17T10:00:00Z', orgaoJulgador: court('1ª Vara Federal de Maringá'), fingerprint: 'a' },
    { dataHora: '2026-08-01T10:00:00Z', orgaoJulgador: court('1ª Vara Federal de Maringá'), fingerprint: 'b' },
    { dataHora: '2026-09-01T10:00:00Z', orgaoJulgador: court('Turma Recursal do PR'), fingerprint: 'c' },
    { dataHora: '2026-09-02T10:00:00Z', orgaoJulgador: null, fingerprint: 'd' }
  ]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.description, 'Mudança de vara: 1ª Vara Federal de Maringá → Turma Recursal do PR');
  assert.equal(changes[0]!.sourceFingerprint, 'c');
  assert.equal(courtChanges('k', [{ dataHora: 'x', orgaoJulgador: court('A'), fingerprint: 'a' }]).length, 0);
});

// Nomes reais de movimentacao do DataJud (TRF4, processo 5013400-76.2026.4.04.7003, consulta de 2026-11-08).
void test('Ver no DJEN so nas movimentacoes que costumam gerar comunicacao', () => {
  for (const name of ['Publicação', 'Expedida/certificada', 'Intimação', 'Decisão', 'Despacho', 'Sentença', 'Acórdão', 'Citação']) {
    assert.equal(movementMayHaveCommunication(name), true, name);
  }
  // TRF1 (processo 1006822-22.2026.4.01.4200, consulta de 2026-11-09): o complemento nao decide.
  for (const name of ['Mero expediente', 'Outras Decisões', 'Expedição de documento — Outros documentos', 'Expedida/Certificada']) {
    assert.equal(movementMayHaveCommunication(name), true, name);
  }
  for (const name of ['Petição', 'Confirmada', 'Conclusão — para julgamento', 'Conclusão — para decisão', 'Distribuição — sorteio', 'Mudança de vara: A → B']) {
    assert.equal(movementMayHaveCommunication(name), false, name);
  }
});

void test('periodo da busca: 3 dias antes a 10 depois, pela data em Brasilia', () => {
  assert.deepEqual(lookupWindow('2026-10-29T02:34:03.000Z'), { from: '2026-10-25', to: '2026-11-07' });
});
