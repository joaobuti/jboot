import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { LEAD_STATUSES } from '../leads/lead-state';
import { ANALYSIS_OPEN_STATUSES, isAnalysisOpen, reconcileLeadStatus } from './lead-analysis-state';

const facts = (documents: number, activeCases: number, approvedCases: number) => ({ documents, activeCases, approvedCases });

void test('analise aberta so em enviado, aguardando_revisao e aprovado', () => {
  assert.deepEqual([...ANALYSIS_OPEN_STATUSES], ['enviado', 'aguardando_revisao', 'aprovado']);
  assert.deepEqual(LEAD_STATUSES.filter(isAnalysisOpen), ['enviado', 'aguardando_revisao', 'aprovado']);
});

void test('PE14: primeiro documento do ciclo leva enviado -> aguardando_revisao; sem documento nada muda', () => {
  assert.deepEqual(reconcileLeadStatus('enviado', facts(0, 1, 0)), []);
  assert.deepEqual(reconcileLeadStatus('enviado', facts(1, 1, 0)), [
    { action: 'first_draft_generated', from: 'enviado', to: 'aguardando_revisao' }
  ]);
});

void test('aprovado quando TODO caso ativo tem documento aprovado (P3: N casos)', () => {
  assert.deepEqual(reconcileLeadStatus('aguardando_revisao', facts(2, 2, 1)), []);
  assert.deepEqual(reconcileLeadStatus('aguardando_revisao', facts(2, 2, 2)), [
    { action: 'documents_approved', from: 'aguardando_revisao', to: 'aprovado' }
  ]);
  // Sem caso ativo nunca aprova (remocao do ultimo caso).
  assert.deepEqual(reconcileLeadStatus('aguardando_revisao', facts(1, 0, 0)), []);
});

void test('reabertura: caso acrescentado/trocado/removido depois da aprovacao volta a aguardando_revisao', () => {
  assert.deepEqual(reconcileLeadStatus('aprovado', facts(2, 2, 2)), []);
  assert.deepEqual(reconcileLeadStatus('aprovado', facts(2, 3, 2)), [
    { action: 'analysis_reopened', from: 'aprovado', to: 'aguardando_revisao' }
  ]);
  assert.deepEqual(reconcileLeadStatus('aprovado', facts(2, 0, 0)), [
    { action: 'analysis_reopened', from: 'aprovado', to: 'aguardando_revisao' }
  ]);
});

void test('fora da analise nada muda', () => {
  for (const status of ['rascunho', 'devolvido', 'em_processamento', 'falha_processamento'] as const) {
    assert.deepEqual(reconcileLeadStatus(status, facts(3, 1, 1)), [], status);
  }
});
