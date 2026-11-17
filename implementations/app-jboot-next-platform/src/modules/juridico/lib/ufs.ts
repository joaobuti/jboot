/**
 * Unidades federativas, usadas nos campos de UF da OAB.
 *
 * Vive aqui, e não duplicada em cada tela, porque as duas origens do módulo
 * (DJEN e busca por OAB) validam a UF com a mesma regra no backend: duas
 * letras, e sempre em par com o número da OAB.
 */
export const UF_LIST = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
