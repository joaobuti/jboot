export const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
] as const;
export type BrazilUf = (typeof BRAZIL_UFS)[number];

/**
 * Numero de inscricao na OAB sem pontos nem espacos: ate 7 digitos e, na inscricao suplementar,
 * a letra final (ex.: `12345-A`). `null` quando nao e um numero valido.
 */
export function normalizeOabNumber(value: string): string | null {
  const compact = value.toUpperCase().replace(/[.\s]/g, '');
  return /^[0-9]{1,7}(-?[A-Z])?$/.test(compact) ? compact : null;
}

export function normalizeLawyerName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
