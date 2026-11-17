/** Never infer completion from prose, comments, provider success or a pending human review. */
export const AUTOMATION_COMPLETION = { version: 1, status: 'succeeded', allTasksCompleted: true } as const;
export const AUTOMATION_COMPLETION_INSTRUCTIONS =
  'Conclua TODAS as tarefas do prompt. Somente apos sucesso de todas elas, confirme explicitamente a conclusao. ' +
  'Rotina Claude: chame flow_complete_automation com runId, boardId, cardId e confirmation ' +
  JSON.stringify(AUTOMATION_COMPLETION) + '. API: a ultima function call deve ser kanban.automation.complete com esses campos de confirmacao. ' +
  'Se houver falha, tarefa pendente, incerteza ou revisao humana, nao confirme. Comentario nao e confirmacao.';

/**
 * Instrucao de conclusao enviada a rotina pelo resultado esperado (ADR 020): Analise de acoes e
 * Peticoes iniciais concluem pela ferramenta propria, que ja confirma; as demais pela confirmacao.
 */
export function completionInstructionsFor(actionConfig: Record<string, unknown> | null | undefined): string {
  const expected = actionConfig?.expectedResult;
  if (expected === 'action_analysis') {
    return 'Conclua registrando a analise por flow_submit_action_analysis; ela encerra a execucao. Nao chame flow_complete_automation.';
  }
  if (expected === 'initial_petitions') {
    return 'Conclua por flow_finish_initial_petitions; ele encerra a execucao. Nao chame flow_complete_automation.';
  }
  return AUTOMATION_COMPLETION_INSTRUCTIONS;
}

export function isAutomationCompletion(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).length === 3 && data.version === 1 && data.status === 'succeeded' && data.allTasksCompleted === true;
}
