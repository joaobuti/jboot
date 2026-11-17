import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mapDataJudSnapshotToFlowCard, mapPjeCommunicationToFlowCard } from './flow-card.mapper';

void test('PJe mapper emits a stable structured source without tenant fields', () => {
  const card = mapPjeCommunicationToFlowCard({
    id: '11111111-1111-4111-8111-111111111111',
    comunicacaoId: 'source-1', numeroComunicacao: '1', hash: 'hash',
    numeroProcesso: '00000000000000000000', numeroProcessoMask: '0000000-00.0000.0.00.0000',
    siglaTribunal: 'TJSC', nomeOrgao: 'Vara', tipoComunicacao: 'Intimacao',
    tipoDocumento: 'Documento', nomeClasse: 'Procedimento', meio: 'D', link: null,
    texto: 'Texto   com espacos', dataDisponibilizacao: '2026-10-06',
    destinatarios: [], advogados: [], createdAt: '2026-10-06T00:00:00.000Z'
  });
  assert.equal(card.sourceType, 'pje_comunicacao');
  assert.equal(card.sourceId, '11111111-1111-4111-8111-111111111111');
  assert.equal('clientId' in card, false);
  assert.match(String(card.description), /Texto com espacos/);
});

void test('DataJud mapper uses CNJ and tribunal as idempotency source and respects description budget', () => {
  const card = mapDataJudSnapshotToFlowCard({
    id: 'snapshot', tribunal: 'TJSC', processNumberCiphertext: Buffer.from('cipher'),
    processFingerprint: 'f'.repeat(64), providerUpdatedAt: '2025-11-11T16:39:47.517Z',
    capturedAt: '2026-10-06T00:00:00.000Z', datajudId: 'source', grau: 'JE',
    dataAjuizamento: '2021-09-01T18:08:27.000Z', sincronizadoEm: null,
    classe: { codigo: 1, nome: 'Acao' }, formato: null, sistema: null,
    orgaoJulgador: null, assuntos: []
  }, '50060041320218240058', Array.from({ length: 200 }, () => ({
    occurredAt: '2025-10-07T18:17:58.000Z', description: 'Movimento '.repeat(20)
  })));
  assert.equal(card.sourceId, '50060041320218240058:TJSC');
  assert.ok(String(card.description).length <= 4000);
  assert.match(String(card.description), /movimentacoes nao exibidas/);
});
