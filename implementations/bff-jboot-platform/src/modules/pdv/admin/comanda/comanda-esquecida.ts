/**
 * Regra de "comanda esquecida", compartilhada pela lista de fechamento
 * (Sprint 4) e pelo mapa do salao (Sprint 8): sem solicitacao de fechamento
 * do cliente E sem atividade ha mais de 45 minutos. Valor de negocio
 * definido pelo usuario; nunca persistido, sempre calculado na leitura.
 *
 * Vive fora dos dois services de proposito — duas copias da constante
 * divergiriam na primeira vez que o numero mudasse.
 */
export const COMANDA_ESQUECIDA_THRESHOLD_MINUTES = 45;

export function isComandaForgotten(row: {
  closingRequestedAt: string | null;
  lastActivityAt: string;
}): boolean {
  if (row.closingRequestedAt) {
    return false;
  }
  const minutesSinceActivity = (Date.now() - new Date(row.lastActivityAt).getTime()) / 60000;
  return minutesSinceActivity > COMANDA_ESQUECIDA_THRESHOLD_MINUTES;
}
