import assert from "node:assert/strict";
import test from "node:test";
import { amountToCents, centsDigits, centsToAmount, formatBrl, formatCents } from "../src/lib/money.ts";

test("digitacao em centavos mostra reais", () => {
  assert.equal(formatCents(centsDigits("57900")), "579,00");
  assert.equal(formatCents(centsDigits("R$ 1.234,56")), "1.234,56");
  assert.equal(formatCents(centsDigits("5")), "0,05");
  assert.equal(formatCents(""), "");
});

test("envio e carga sem perder centavos", () => {
  assert.equal(centsToAmount("57900"), 579);
  assert.equal(centsToAmount(""), null);
  assert.equal(amountToCents(579.9), "57990");
  assert.equal(amountToCents(null), "");
  assert.equal(formatBrl(1234.5), "R$ 1.234,50");
  assert.equal(formatBrl(null), "-");
});
