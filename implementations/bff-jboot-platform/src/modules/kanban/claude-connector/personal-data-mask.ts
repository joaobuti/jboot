/**
 * Mascara dados pessoais em texto livre antes de sair para o Claude (conta
 * pessoal do usuario, Termos de Consumidor da Anthropic). Heuristica por
 * padrao: cobre CPF, CNPJ, e-mail e telefone brasileiro; nome proprio e
 * endereco nao sao detectaveis com seguranca e continuam visiveis.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail oculto]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ oculto]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF oculto]'],
  [/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone oculto]']
];

export function maskPersonalData(text: string): string {
  return PATTERNS.reduce((masked, [pattern, replacement]) => masked.replace(pattern, replacement), text);
}

export function maskIf(enabled: boolean, text: string | null): string | null {
  return text === null || !enabled ? text : maskPersonalData(text);
}
