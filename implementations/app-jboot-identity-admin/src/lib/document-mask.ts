/**
 * Documento do cliente: mascara de CPF ate 11 digitos e de CNPJ a partir do 12o. O banco guarda so
 * os digitos (seeds, buscas e a validacao do BFF usam o numero sem pontuacao).
 */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function documentTypeFor(digits: string): "cpf" | "cnpj" {
  return digits.length > 11 ? "cnpj" : "cpf";
}

export function formatCpfCnpj(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/\/(\d{4})(\d{1,2})$/, "/$1-$2");
}
