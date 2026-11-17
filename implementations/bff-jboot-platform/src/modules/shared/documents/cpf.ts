import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Normalizacao e validacao de CPF (pessoa fisica). Funcoes puras e neutras,
 * compartilhadas entre `establishment-customers` (busca por CPF normalizado)
 * e `kanban` (validacao de entrada). Nunca registrar o valor em log.
 */

/** Remove tudo que nao e digito. */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

/** 11 digitos, nao repetidos, com os dois digitos verificadores corretos. */
export function isValidCpf(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Aceita apenas digitos e a mascara usual (pontos, hifen, espacos); qualquer
  // outro caractere invalida em vez de ser descartado silenciosamente.
  if (!/^[\d.\-\s]+$/.test(value)) {
    return false;
  }
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }
  const numbers = digits.split('').map(Number);
  const checkDigit = (length: number): number => {
    const sum = numbers.slice(0, length).reduce((acc, digit, index) => acc + digit * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return checkDigit(9) === numbers[9] && checkDigit(10) === numbers[10];
}

/** Decorator class-validator. A mensagem nunca inclui o valor recebido. */
export function IsCpf(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be a valid CPF`, ...options },
      validator: {
        validate: (value: unknown) => isValidCpf(value)
      }
    });
  };
}
