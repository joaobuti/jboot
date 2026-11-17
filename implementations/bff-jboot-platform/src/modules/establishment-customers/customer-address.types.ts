/**
 * Endereco do cliente que a IA pode preencher a partir do comprovante de residencia, na validacao de
 * cadastro do Flow. Colunas de `pdv_establishment_customers`; o endereco entra em bloco, so quando a
 * ficha nao tem nenhum campo de endereco (nunca mistura endereco da ficha com o do documento).
 */
export const CUSTOMER_ADDRESS_FILLABLE_FIELDS = [
  'addressZip',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressNeighborhood',
  'addressCity',
  'addressState'
] as const;

export type CustomerAddressFillableField = (typeof CUSTOMER_ADDRESS_FILLABLE_FIELDS)[number];
export type CustomerAddressFillInput = Partial<Record<CustomerAddressFillableField, string>>;
