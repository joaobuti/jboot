/**
 * Numero unico de processo (CNJ, Resolucao 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.
 * Funcoes puras, espelho de `svc-jboot-juridico-data/src/juridico_data/domain/cnj.py`
 * (digito verificador ISO 7064 mod 97 e inferencia do tribunal pelo segmento J.TR).
 */

const CNJ_FORMATTED = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
const CNJ_DIGITS = /^\d{20}$/;

const STATE_BY_CODE: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF', '08': 'ES', '09': 'GO',
  '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI',
  '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC', '25': 'SE', '26': 'SP', '27': 'TO'
};

/** 20 digitos com o digito verificador correto, ou `null`. Aceita so digitos ou a mascara oficial completa. */
export function normalizeCnj(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const stripped = value.trim();
  let digits: string;
  if (CNJ_FORMATTED.test(stripped)) digits = stripped.replace(/[-.]/g, '');
  else if (CNJ_DIGITS.test(stripped)) digits = stripped;
  else return null;
  const base = `${digits.slice(0, 7)}${digits.slice(9)}00`;
  let remainder = 0;
  for (const digit of base) remainder = (remainder * 10 + Number(digit)) % 97;
  return Number(digits.slice(7, 9)) === 98 - remainder ? digits : null;
}

/** Sigla do tribunal (indice DataJud) pelo segmento J.TR; `null` quando o segmento nao mapeia. */
export function inferCnjTribunal(digits: string): string | null {
  const branch = digits[13];
  const code = digits.slice(14, 16);
  const state = STATE_BY_CODE[code];
  switch (branch) {
    case '1': return 'STF';
    case '3': return 'STJ';
    case '4': return `TRF${Number(code)}`;
    case '5': return `TRT${Number(code)}`;
    case '6': return state ? `TRE${state}` : null;
    case '7': return 'STM';
    case '8': return state ? `TJ${state}` : null;
    case '9': return ({ '13': 'TJMMG', '21': 'TJMRS', '26': 'TJMSP' } as Record<string, string>)[code] ?? null;
    default: return null;
  }
}

/** Mascara oficial a partir dos 20 digitos. */
export function formatCnj(digits: string): string {
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}
