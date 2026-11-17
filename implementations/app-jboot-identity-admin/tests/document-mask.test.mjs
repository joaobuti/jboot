import assert from "node:assert/strict";
import test from "node:test";
import { documentTypeFor, formatCpfCnpj, onlyDigits } from "../src/lib/document-mask.ts";

test("CPF ate 11 digitos, CNPJ a partir do 12o", () => {
  assert.equal(formatCpfCnpj("58631488968"), "586.314.889-68");
  assert.equal(formatCpfCnpj("586314"), "586.314");
  assert.equal(formatCpfCnpj("5863148896"), "586.314.889-6");
  assert.equal(formatCpfCnpj("63784101000110"), "63.784.101/0001-10");
  assert.equal(formatCpfCnpj("637841010001"), "63.784.101/0001");
});

test("colar com pontuacao ou repetido nao passa de 14 digitos", () => {
  assert.equal(onlyDigits("586.314.889-68586.314.889-68"), "58631488968586");
  assert.equal(formatCpfCnpj("63.784.101/0001-10"), "63.784.101/0001-10");
});

test("tipo do documento pelo tamanho", () => {
  assert.equal(documentTypeFor("58631488968"), "cpf");
  assert.equal(documentTypeFor("63784101000110"), "cnpj");
});
