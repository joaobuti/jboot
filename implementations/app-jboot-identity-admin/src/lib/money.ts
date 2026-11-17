/**
 * Mensalidade digitada como dinheiro: o campo guarda os centavos (so digitos) e mostra "1.234,56".
 * Ex.: digitar 57900 mostra 579,00; o BFF recebe 579 (numero, duas casas no maximo).
 */
const BRL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function centsDigits(value: string): string {
  return value
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 12);
}

export function formatCents(digits: string): string {
  if (!digits) return "";
  return BRL.format(Number(digits) / 100);
}

export function centsToAmount(digits: string): number | null {
  return digits ? Number(digits) / 100 : null;
}

export function amountToCents(amount: number | null | undefined): string {
  return amount === null || amount === undefined
    ? ""
    : String(Math.round(amount * 100));
}

export function formatBrl(amount: number | null | undefined): string {
  return amount === null || amount === undefined
    ? "-"
    : `R$ ${BRL.format(amount)}`;
}
