import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isLeadEditable, isLeadStatus, LEAD_STATUSES, LEAD_TRANSITIONS, LeadAction, nextLeadStatus } from './lead-state';

void test('estado do lead: enum completo do PO, na ordem do artefato', () => {
  assert.deepEqual(
    [...LEAD_STATUSES],
    ['rascunho', 'enviado', 'em_processamento', 'aguardando_revisao', 'aprovado', 'devolvido', 'falha_processamento']
  );
  assert.equal(isLeadStatus('enviado'), true);
  assert.equal(isLeadStatus('arquivado'), false);
  assert.equal(isLeadStatus(null), false);
});

void test('transicoes: tabela completa por (estado, acao)', () => {
  const expected: Record<LeadAction, Partial<Record<string, string>>> = {
    submit: { rascunho: 'enviado', devolvido: 'enviado' },
    return: { enviado: 'devolvido', aguardando_revisao: 'devolvido', falha_processamento: 'devolvido' },
    // PE14 (S6, sem IA): primeiro rascunho gerado pelo gestor.
    first_draft_generated: { enviado: 'aguardando_revisao' },
    // S6: todos os casos ativos com documento aprovado; reabertura ao mudar os casos.
    documents_approved: { aguardando_revisao: 'aprovado' },
    analysis_reopened: { aprovado: 'aguardando_revisao' }
  };
  for (const action of Object.keys(LEAD_TRANSITIONS) as LeadAction[]) {
    for (const from of LEAD_STATUSES) {
      assert.equal(nextLeadStatus(from, action), expected[action][from] ?? null, `${action} a partir de ${from}`);
    }
  }
});

void test('congelamento (P21): so rascunho e devolvido sao editaveis', () => {
  const editable = LEAD_STATUSES.filter(isLeadEditable);
  assert.deepEqual(editable, ['rascunho', 'devolvido']);
});

void test('devolucao nunca durante em_processamento (corrida com o pipeline da S7) nem de aprovado', () => {
  assert.equal(nextLeadStatus('em_processamento', 'return'), null);
  assert.equal(nextLeadStatus('aprovado', 'return'), null);
});
