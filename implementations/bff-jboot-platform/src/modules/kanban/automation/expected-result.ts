import { AutomationExpectedResult, EXPECTED_RESULTS } from './dto/automation-rule.dto';

/**
 * Resultado esperado copiado da regra para a execucao no disparo (ADR 020). Execucao disparada antes
 * do campo existir volta `null` e conclui pela confirmacao (`flow_complete_automation`).
 */
export function expectedResultOf(actionConfig: Record<string, unknown> | null | undefined): AutomationExpectedResult | null {
  const value = actionConfig?.expectedResult;
  return typeof value === 'string' && (EXPECTED_RESULTS as string[]).includes(value) ? (value as AutomationExpectedResult) : null;
}

/**
 * `flow_complete_automation` conclui a execucao so quando a regra espera comentario (ou nao declarou);
 * Analise de acoes e Peticoes iniciais concluem pela ferramenta propria.
 */
export function confirmationCompletesRun(actionConfig: Record<string, unknown> | null | undefined): boolean {
  const expected = expectedResultOf(actionConfig);
  return expected === null || expected === 'comment';
}
