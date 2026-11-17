export type DocumentType = 'cpf' | 'cnpj';

export function normalizeDocument(input: string): { documentType: DocumentType; documentNumber: string } {
  const documentNumber = input.replace(/\D/g, '');
  if (documentNumber.length === 11) {
    return { documentType: 'cpf', documentNumber };
  }
  if (documentNumber.length === 14) {
    return { documentType: 'cnpj', documentNumber };
  }
  throw new Error('INVALID_DOCUMENT');
}

