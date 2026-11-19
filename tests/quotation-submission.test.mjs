import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path, mocks, expose = "") {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  const localRequire = (name) => name in mocks ? mocks[name] : name.startsWith("@/")
    ? load(existsSync(new URL(`../src/${name.slice(2)}.ts`, import.meta.url)) ? `src/${name.slice(2)}.ts` : `src/${name.slice(2)}.tsx`, mocks) : require(name);
  vm.runInNewContext(outputText + expose, { module: loaded, exports: loaded.exports, require: localRequire, Intl, Date, console: { error() {} }, Number, String });
  return loaded.exports;
}
function fixture(result, { revalidateFails = false } = {}) {
  let calls = 0, payload;
  const { submitQuotation } = load("src/features/quotations/actions.ts", {
    "@/lib/supabase/server": { createServerSupabaseClient: async () => ({ rpc: async (_name, args) => {
      calls++; payload = args;
      if (result instanceof Error) throw result;
      return result;
    } }) },
    "next/cache": { revalidatePath() { if (revalidateFails) throw new Error("cache"); } },
  });
  return { submit: (data) => submitQuotation({ error: null }, data), calls: () => calls, payload: () => payload };
}
function form({ quantity = "12", status = "priced", price = "10,00" } = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ token: "token", itemId: "item", status_item: status, preco_item: price, nome_item: "Produto" })) data.set(key, value);
  if (quantity !== null) data.set("forma_item", quantity);
  return data;
}
const completed = { data: { status: "completed", answered_items: 1, total_items: 1 }, error: null };

test("recibo distingue conclusão de resposta parcial e identifica os itens salvos", async () => {
  const full = await fixture(completed).submit(form());
  assert.equal(full.submitted, true);
  assert.equal(full.partial, false);
  assert.equal(full.receivedItemIds.join(), "item");
  const partial = await fixture({ data: { status: "partial", answered_items: 1, total_items: 2 }, error: null }).submit(form());
  assert.equal(partial.partial, true);
  assert.equal(partial.answeredItems, 1);
  assert.equal(partial.totalItems, 2);
});

test("falha de transporte e resultado desconhecido exigem conferir recebimento", async () => {
  for (const result of [new Error("rede"), { data: null, error: null }, { data: {}, error: null }]) {
    const state = await fixture(result).submit(form());
    assert.equal(state.uncertain, true);
    assert.equal(state.submitted, undefined);
    assert.match(state.error, /Reabra/);
  }
});

test("falha de cache não transforma resposta gravada em erro de envio", async () => {
  const state = await fixture(completed, { revalidateFails: true }).submit(form());
  assert.equal(state.submitted, true);
});

test("quantidade de embalagem vazia, zero, negativa ou inválida não chega à RPC", async () => {
  for (const quantity of ["", "0", "-1", "abc", "Infinity"]) {
    const current = fixture(completed);
    const state = await current.submit(form({ quantity }));
    assert.equal(current.calls(), 0);
    assert.match(state.error, /embalagem/);
  }
});

test("item sem forma e produto indisponível não exigem quantidade de embalagem", async () => {
  for (const data of [form({ quantity: null }), form({ quantity: "", status: "unavailable", price: "" })]) {
    assert.equal((await fixture(completed).submit(data)).submitted, true);
  }
});

test("duplicidade orienta reabrir; erros de banco e link não mostram sucesso", async () => {
  const duplicate = await fixture({ error: { message: "Item já foi respondido" } }).submit(form());
  assert.equal(duplicate.uncertain, true);
  const expired = await fixture({ error: { code: "42501", message: "inválido" } }).submit(form());
  assert.match(expired.error, /novo link/);
  const failed = await fixture({ error: { code: "OTHER", message: "interno" } }).submit(form());
  assert.equal(failed.submitted, undefined);
  assert.doesNotMatch(failed.error, /interno/);
});

function element(tag) {
  return function NativeStub({ children, ...props }) {
    const native = { ...props };
    for (const key of ["variant", "size", "emptyOptionLabel", "options", "onValueChange"]) delete native[key];
    return React.createElement(tag, native, children);
  };
}
const formModule = load("src/components/quotations/quotation-response-form.tsx", {
  "@/components/ui/button": { Button: element("button") },
  "@/components/ui/input": { Input: element("input") },
  "@/components/ui/themed-select": { ThemedSelect: element("select") },
  "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogBody", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((key) => [key, element("div")])),
  "@/features/quotations/actions": { submitQuotation: async () => ({ error: null }) },
}, "\nmodule.exports.testOnly = { parseDraft, ItemCard };" );
const { parseDraft, ItemCard } = formModule.testOnly;
const item = {
  supplier_quotation_item_id: "item", quotation_item_id: "quotation-item", group: "Grupo", product_name: "Produto",
  requested_quantity: "1", purchase_unit: { symbol: "cx" }, pricing_unit: { symbol: "cx" },
  comparison_unit: { symbol: "un" }, purchase_form: { unit_quantity: 1, base_quantity: 12 },
  attributes: [], last_supplier_price: null, last_supplier_price_at: null,
};
function card(draft, overrides = {}) {
  return renderToStaticMarkup(React.createElement(ItemCard, {
    token: "token", item: { ...item, ...overrides }, initialDraft: draft, flagged: true,
    onResolvedChange() {}, onHistoricalPresentationChange() {}, onSuspiciousPriceChange() {},
  }));
}
const draft = { status: "priced", price: "10,00", attributes: {}, obs: "", formQuantity: "24" };

test("rascunhos antigos continuam válidos e os novos preservam a quantidade", () => {
  assert.equal(parseDraft(JSON.stringify(draft)).formQuantity, "24");
  assert.equal(parseDraft(JSON.stringify({ status: "priced", price: "10,00" })).formQuantity, undefined);
  assert.equal(parseDraft("inválido"), null);
  assert.match(card(parseDraft(JSON.stringify(draft))), /name="forma_item"[^>]*value="24"/);
});

test("embalagem inválida fica pendente e aponta o campo correto", () => {
  const html = card({ ...draft, formQuantity: "" });
  assert.match(html, /data-pending-field="forma_item"/);
  assert.match(html, /Informe uma quantidade válida/);
  assert.doesNotMatch(html, />Preenchido</);
});

test("campo obrigatório e fator inválido apontam para o atributo, sem voltar ao preço", () => {
  const attr = { attribute_definition_id: "factor", name: "Conteúdo", data_type: "numeric", required: true, is_conversion_factor: true, suggested_value_numeric: null, unit: null };
  for (const value of ["", "0"]) {
    const html = card({ ...draft, attributes: { factor: value } }, { purchase_form: null, purpose: "resale", attributes: [attr] });
    assert.match(html, /data-pending-field="attr_item_factor__numeric"/);
    assert.doesNotMatch(html, />Preenchido</);
  }
});

test("preenchimento completo usa rótulo preenchido, nunca respondido antes de enviar", () => {
  const html = card(draft);
  assert.match(html, />Preenchido</);
  assert.doesNotMatch(html, />Respondido</);
});

const { QuotationReceipt } = load("src/components/quotations/quotation-receipt.tsx", {});
const receipt = {
  submitted_at: "2026-11-19T14:35:00Z", response_status: "completed", comparison_enabled: true,
  items: [{ item_id: "item", product_name: "Meu produto", requested_quantity: 2, purchase_unit: "cx", pricing_unit: "cx", comparison_unit: "un",
    quoted_price: 120, is_available: true, does_not_supply: false, notes: "Minha observação", form_base_per_unit: 12,
    attributes: [{ name: "Marca", value: "Minha marca", unit: null }], comparison_band: "up_to_5" }],
};

test("resumo exibe resposta gravada, embalagem, atributos e horário de São Paulo", () => {
  const html = renderToStaticMarkup(React.createElement(QuotationReceipt, { receipt }));
  for (const text of ["Meu produto", "120,00", "Cada cx com 12 un", "Minha observação", "Minha marca", "11:35", "até 5% acima", "não representa decisão de compra"]) assert.ok(html.includes(text), text);
});

test("desativar comparação oculta a faixa e mantém o recibo", () => {
  const html = renderToStaticMarkup(React.createElement(QuotationReceipt, { receipt: { ...receipt, comparison_enabled: false } }));
  assert.match(html, /Meu produto/);
  assert.doesNotMatch(html, /acima|menores preços|ofertas comparáveis/);
});

test("recibo não atribui preço ou posição a produto não fornecido", () => {
  const html = renderToStaticMarkup(React.createElement(QuotationReceipt, { receipt: { ...receipt, items: [{ ...receipt.items[0], quoted_price: null, does_not_supply: true, comparison_band: null }] } }));
  assert.match(html, /Não trabalho com este produto/);
  assert.doesNotMatch(html, /R\$|acima|menores preços/);
});

test("resumo vazio não é exibido como recibo", () => {
  assert.equal(renderToStaticMarkup(React.createElement(QuotationReceipt, { receipt: { ...receipt, items: [] } })), "");
});

test("falha em carregar recibo não desfaz envio; recibo válido acompanha a confirmação", async () => {
  for (const fail of [true, false]) {
    const { submitQuotation } = load("src/features/quotations/actions.ts", {
      "next/cache": { revalidatePath() {} },
      "@/lib/supabase/server": { createServerSupabaseClient: async () => ({ rpc: async (name) => name === "rpc_public_get_quotation_receipt"
        ? { data: fail ? null : receipt, error: fail ? { message: "resumo indisponível" } : null }
        : completed }) },
    });
    const state = await submitQuotation({ error: null }, form());
    assert.equal(state.submitted, true);
    assert.equal(state.receipt?.items[0].quoted_price ?? null, fail ? null : 120);
  }
});
