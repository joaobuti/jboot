export function normalizeCnj(value: string): string {
  return value.replace(/\D/g, "").slice(0, 20);
}

export function formatCnj(value: string): string {
  const digits = normalizeCnj(value);
  return digits
    .replace(/^(\d{7})(\d)/, "$1-$2")
    .replace(/^(\d{7}-\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{7}-\d{2}\.\d{4})(\d)/, "$1.$2")
    .replace(/^(\d{7}-\d{2}\.\d{4}\.\d)(\d)/, "$1.$2")
    .replace(/^(\d{7}-\d{2}\.\d{4}\.\d\.\d{2})(\d)/, "$1.$2");
}

export function isValidCnj(value: string): boolean {
  const digits = normalizeCnj(value);
  if (digits.length !== 20) return false;
  const base = `${digits.slice(0, 7)}${digits.slice(9)}00`;
  let remainder = 0;
  for (const digit of base) remainder = (remainder * 10 + Number(digit)) % 97;
  return Number(digits.slice(7, 9)) === 98 - remainder;
}
