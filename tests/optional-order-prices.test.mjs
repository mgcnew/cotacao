import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadSource(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loadedModule = { exports: {} };
  const localRequire = (name) => name.startsWith("@/")
    ? loadSource(`src/${name.slice(2)}.ts`)
    : require(name);
  vm.runInNewContext(outputText, { module: loadedModule, exports: loadedModule.exports, require: localRequire, Intl, Date });
  return loadedModule.exports;
}
const { canReceiveAsOrdered } = loadSource("src/features/receipts/quick-receipt.ts");
const { buildOrderMessage } = loadSource("src/features/orders/message.ts");
const item = { agreedPrice: 12.5, sameUnit: true, requestedQuantity: 2, pendingQuantity: 2, estimatedPricingQuantity: null };

test("recebimento rápido exige referência de preço para todos os itens com saldo", () => {
  assert.equal(canReceiveAsOrdered([item]), true);
  assert.equal(canReceiveAsOrdered([item, { ...item, agreedPrice: null }]), false);
  assert.equal(canReceiveAsOrdered([{ ...item, agreedPrice: null, pendingQuantity: 0 }, item]), true);
  assert.equal(canReceiveAsOrdered([{ ...item, agreedPrice: 0 }]), true);
});

test("mensagem diferencia preço ausente de preço zero e solicita documento", () => {
  const context = {
    orderNumber: 1, companyName: "Loja", companyDocument: null,
    supplierName: "Fornecedor", deliveryDueDate: null, revisionNumber: 1,
    items: [{ productName: "Arroz", requestedQuantity: 2, purchaseUnit: "un", pricingUnit: "un", agreedPrice: null }],
  };
  const missing = buildOrderMessage(context, null);
  assert.match(missing, /preço não informado/);
  assert.match(missing, /espelho do pedido ou comprovante/);
  assert.doesNotMatch(missing, /0,00/);
  const zero = buildOrderMessage({ ...context, items: [{ ...context.items[0], agreedPrice: 0 }] }, null);
  assert.match(zero, /0,00/);
  assert.doesNotMatch(zero, /preço não informado/);
});
