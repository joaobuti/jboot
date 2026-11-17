import { strict as assert } from 'node:assert';
import { GatewayTimeoutException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { test } from 'node:test';
import { maskCnj, movementDescription, runStatusFromError, snapshotFromResponse } from './process-fingerprint';

void test('status da execucao pelo codigo do servico ou, sem codigo, pelo status HTTP', () => {
  assert.equal(runStatusFromError(new HttpException({ code: 'process_not_found' }, 404)), 'not_found');
  // Regressao (2026-11-08): DataJud levou 25-40 s, o cliente desistiu em 15 s com 504 sem codigo.
  assert.equal(runStatusFromError(new GatewayTimeoutException('Servico de dados juridicos excedeu o tempo limite')), 'timeout');
  assert.equal(runStatusFromError(new ServiceUnavailableException('Servico de dados juridicos indisponivel')), 'provider_unavailable');
  assert.equal(runStatusFromError(new Error('x')), 'failed');
});

void test('mascara CNJ de 20 digitos', () => {
  assert.equal(maskCnj('07012347720268040001'), '0701234-77.2026.8.04.0001');
});

// Complementos reais do DataJud (TRF4, processo 5013400-76.2026.4.04.7003, consulta de 2026-11-08):
// Conclusao -> tipo_de_conclusao "para julgamento"; Documento -> tipo_de_documento "Certidao".
void test('texto da movimentacao junta os complementos tabelados ao nome', () => {
  assert.equal(movementDescription({ nome: 'Conclusão', complementos: [{ codigo: 3, descricao: 'tipo_de_conclusao', valor: '36', nome: 'para julgamento' }] }), 'Conclusão — para julgamento');
  assert.equal(movementDescription({ nome: 'Documento', complementos: [{ codigo: 4, descricao: 'tipo_de_documento', valor: '107', nome: 'Certidão' }] }), 'Documento — Certidão');
  assert.equal(movementDescription({ nome: 'Petição', complementos: [] }), 'Petição');
  assert.equal(movementDescription({ nome: 'Petição', complementos: [{ nome: '' }, { nome: 'petição' }, { nome: null }] }), 'Petição');
  assert.equal(movementDescription({ nome: 'Juntada', complementos: [{ nome: 'Petição' }, { nome: 'Petição' }, { nome: 'Contestação' }] }), 'Juntada — Petição, Contestação');
});

void test('mudar o texto nao muda a identificacao da movimentacao', () => {
  const movement = { codigo: 51, nome: 'Conclusão', dataHora: '2026-09-29T10:00:00Z', orgaoJulgador: null, complementos: [{ codigo: 3, descricao: 'tipo_de_conclusao', valor: '36', nome: 'para julgamento' }] };
  const response = (description: unknown) => ({ requestId: 'r', source: 'datajud', capturedAt: '', process: { tribunal: 'TRF4', dataUltimaAtualizacao: null, movimentacoes: [{ ...movement, ...(description as object) }] } }) as never;
  const snapshot = snapshotFromResponse('k', response({}));
  assert.equal(snapshot.movements[0]!.description, 'Conclusão — para julgamento');
  assert.equal(snapshot.movements[0]!.fingerprint.length, 64);
});

void test('retrato guarda ajuizamento, classe, vara e sistema do processo', () => {
  const snapshot = snapshotFromResponse('k', {
    requestId: 'r', source: 'datajud', capturedAt: '',
    process: {
      tribunal: 'TRF4', dataUltimaAtualizacao: null, dataAjuizamento: '2026-07-17T16:35:27Z',
      classe: { codigo: 436, nome: 'Procedimento do Juizado Especial Cível' },
      orgaoJulgador: { codigo: 12616, nome: '1ª Vara Federal de Maringá' },
      sistema: { codigo: 4, nome: 'Projudi' },
      movimentacoes: []
    }
  } as never);
  assert.deepEqual(snapshot.details, {
    filedAt: '2026-07-17T16:35:27Z', className: 'Procedimento do Juizado Especial Cível',
    courtName: '1ª Vara Federal de Maringá', systemName: 'Projudi'
  });
});
