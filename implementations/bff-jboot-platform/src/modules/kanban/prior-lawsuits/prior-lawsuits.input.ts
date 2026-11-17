/**
 * Numero do processo no padrao CNJ (Resolucao CNJ 65/2008): `NNNNNNN-DD.AAAA.J.TR.OOOO`. Aceita com
 * ou sem mascara (20 digitos); devolve mascarado ou `null` quando nao e CNJ.
 */
export function normalizeCnjNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[0-9.\-\s]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

/** Banco como a pessoa digitou, sem espacos repetidos. */
export function normalizeBank(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
