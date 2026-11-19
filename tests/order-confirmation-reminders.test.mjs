import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadSource(path, mocks = {}, globals = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  const localRequire = (name) => name in mocks ? mocks[name] : name.startsWith("@/")
    ? loadSource(`src/${name.slice(2)}.ts`, mocks, globals) : require(name);
  vm.runInNewContext(outputText, { module: loaded, exports: loaded.exports, require: localRequire, Intl, Date, console, ...globals });
  return loaded.exports;
}
const { isOrderReminderBusinessTime, stillAwaitingOrderConfirmation } = loadSource("src/features/orders/reminder-rules.ts");
const { buildOrderMessage, buildOrderReminderMessage } = loadSource("src/features/orders/message.ts");
const context = {
  orderNumber: 42, companyName: "Loja", companyDocument: null,
  supplierName: "Fornecedor", revisionNumber: 2, deliveryDueDate: "2026-11-20",
  items: Array.from({ length: 100 }, (_, index) => ({ productName: `Produto secreto ${index}`, requestedQuantity: 50, agreedPrice: 10, purchaseUnit: "cx", pricingUnit: "kg" })),
};

test("mensagem com muitos itens continua curta e direciona ao link", () => {
  const message = buildOrderMessage(context, "https://loja.example/o/token");
  assert.match(message, /100 produtos/);
  assert.match(message, /revisão 2/);
  assert.match(message, /20\/11\/2026/);
  assert.match(message, /1 hora/);
  assert.ok(message.length < 700);
  assert.doesNotMatch(message, /Produto secreto|R\$/);
});

test("modelo antigo recebe contagem no lugar dos itens e mantém confirmação e link", () => {
  const message = buildOrderMessage(context, "https://loja.example/o/token", "Pedido {numero_pedido}\n{itens}\nTotal {total}");
  assert.match(message, /100 produtos/);
  assert.match(message, /1 hora/);
  assert.match(message, /https:\/\/loja.example\/o\/token/);
  assert.doesNotMatch(message, /Produto secreto|Total|\{itens\}|\{total\}/);
});

test("lembrete identifica pedido e revisão sem revelar produtos", () => {
  const message = buildOrderReminderMessage(context, "https://loja.example/o/novo-token");
  assert.match(message, /Pedido #42 — revisão 2/);
  assert.match(message, /Loja/);
  assert.match(message, /novo-token/);
  assert.doesNotMatch(message, /Produto secreto|R\$/);
});

test("horário comercial respeita os limites e o fuso de São Paulo", () => {
  for (const [iso, expected] of [
    ["2026-11-16T10:59:59Z", false], ["2026-11-16T11:00:00Z", true],
    ["2026-11-16T20:59:59Z", true], ["2026-11-16T21:00:00Z", false],
    ["2026-11-20T14:00:00Z", true], ["2026-11-21T14:00:00Z", false],
    ["2026-11-22T14:00:00Z", false],
  ]) assert.equal(isOrderReminderBusinessTime(new Date(iso)), expected, iso);
});

test("somente a revisão vigente e enviada de pedido aguardando confirmação aceita lembrete", () => {
  const revision = { id: "revision", status: "sent" };
  const order = { status: "awaiting_confirmation", currentRevisionId: "revision" };
  assert.equal(stillAwaitingOrderConfirmation(order, revision), true);
  for (const status of ["draft", "awaiting_delivery", "cancelled", "received", "partially_received"]) {
    assert.equal(stillAwaitingOrderConfirmation({ ...order, status }, revision), false);
  }
  for (const status of ["confirmed", "contested", "superseded", "cancelled", "draft"]) {
    assert.equal(stillAwaitingOrderConfirmation(order, { ...revision, status }), false);
  }
  assert.equal(stillAwaitingOrderConfirmation({ ...order, currentRevisionId: "new" }, revision), false);
});

function workerFixture({ confirmedDuringRead = false, connected = true, sendOk = true, hour = "14", initialStatus = "sent", logError = false } = {}) {
  const sent = [], updates = [], reads = [];
  const reminder = { id: "reminder", company_id: "company", order_revision_id: "revision", source_communication_id: "source" };
  const order = { id: "order", supplier_id: "supplier", order_number: 42, status: "awaiting_confirmation", current_revision_id: "revision", suppliers: { name: "Fornecedor" } };
  let revisionReads = 0;
  const client = {
    rpc(name) { return Promise.resolve({ data: name.includes("claim") ? [reminder] : "id", error: null }); },
    from(table) {
      let operation = "select", payload;
      const query = {
        select() { return query; }, eq(key, value) { reads.push([table, key, value]); return query; }, limit() { return query; },
        update(values) { operation = "update"; payload = values; return query; },
        insert(values) { operation = "insert"; payload = values; return query; },
        single() { return query; }, maybeSingle() { return query; },
        then(resolve, reject) {
          let result;
          if (operation === "update") { updates.push({ table, ...payload }); result = { data: null, error: null }; }
          else if (operation === "insert") { result = { data: { id: "log" }, error: logError ? { message: "log indisponível" } : null }; }
          else if (table === "communication_logs") result = { data: { supplier_id: "supplier", supplier_contact_id: "contact" }, error: null };
          else if (table === "order_revisions") {
            revisionReads++;
            result = { data: { id: "revision", status: revisionReads > 1 && confirmedDuringRead ? "confirmed" : initialStatus, revision_number: 2, orders: order }, error: null };
          } else if (table === "orders") result = { data: { ...order, status: confirmedDuringRead ? "awaiting_delivery" : order.status }, error: null };
          else if (table === "whatsapp_connections") result = { data: { instance_name: "instance", status: connected ? "connected" : "disconnected" }, error: null };
          else if (table === "companies") result = { data: { name: "Loja", legal_name: null }, error: null };
          else if (table === "supplier_contacts") result = { data: { whatsapp: "11999999999" }, error: null };
          else throw new Error(`Tabela inesperada: ${table}`);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const fixed = new Date(`2026-11-16T${hour}:00:00Z`).getTime();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }
  const worker = loadSource("src/features/orders/reminders.ts", {
    "server-only": {}, "@/lib/env": { publicEnv: { NEXT_PUBLIC_APP_URL: "https://loja.example" } },
    "@/lib/evolution/client": { sendWhatsAppText: async (...args) => { sent.push(args); return sendOk ? { ok: true, externalMessageId: "external" } : { ok: false, error: "timeout" }; } },
  }, { Date: Clock, console: { error() {} } });
  return { run: () => worker.processOrderConfirmationReminders(client), sent, updates, reads };
}

test("worker envia ao contato original e registra o resultado", async () => {
  const fixture = workerFixture();
  const result = await fixture.run();
  assert.equal(result.sent, 1);
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.sent[0][0], "5511999999999");
  assert.equal(fixture.sent[0][2], "instance");
  assert.ok(fixture.reads.some(([table, key, value]) => table === "supplier_contacts" && key === "id" && value === "contact"));
  assert.ok(fixture.updates.some((update) => update.status === "sent"));
});

test("worker não envia se o fornecedor confirmar durante o processamento", async () => {
  const fixture = workerFixture({ confirmedDuringRead: true });
  await fixture.run();
  assert.equal(fixture.sent.length, 0);
  assert.ok(fixture.updates.some((update) => update.status === "skipped"));
});

test("worker ignora uma revisão contestada", async () => {
  const fixture = workerFixture({ initialStatus: "contested" });
  await fixture.run();
  assert.equal(fixture.sent.length, 0);
  assert.ok(fixture.updates.some((update) => update.status === "skipped"));
});

test("desconexão ou fim do horário mantém o lembrete pendente", async () => {
  for (const options of [{ connected: false }, { hour: "21" }]) {
    const fixture = workerFixture(options);
    await fixture.run();
    assert.equal(fixture.sent.length, 0);
    assert.ok(fixture.updates.some((update) => update.status === "pending"));
  }
});

test("falha do provedor fica registrada sem repetir a mensagem", async () => {
  const fixture = workerFixture({ sendOk: false });
  const result = await fixture.run();
  assert.equal(result.failed, 1);
  assert.equal(fixture.sent.length, 1);
  assert.ok(fixture.updates.some((update) => update.status === "failed"));
});

test("sem registro da tentativa não chama o provedor", async () => {
  const fixture = workerFixture({ logError: true });
  const result = await fixture.run();
  assert.equal(result.failed, 1);
  assert.equal(fixture.sent.length, 0);
});

test("rota do cron rejeita chamadas sem o segredo e não processa pedidos", async () => {
  let calls = 0;
  const route = loadSource("src/app/api/orders/confirmation-reminders/route.ts", {
    "@/features/orders/reminders": { processOrderConfirmationReminders: async () => { calls++; return { claimed: 0, sent: 0, failed: 0 }; } },
    "@/lib/env": { getServerEnv: () => ({ CRON_SECRET: "test-secret" }) },
    "@/lib/evolution/client": { isEvolutionConfigured: () => true },
    "@/lib/supabase/service": { createServiceRoleClient: () => ({}) },
  }, { Response });
  for (const authorization of [null, "Bearer errado"]) {
    const response = await route.GET({ headers: new Headers(authorization ? { authorization } : {}) });
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 0);
  const authorized = await route.GET({ headers: new Headers({ authorization: "Bearer test-secret" }) });
  assert.equal(authorized.status, 200);
  assert.equal(calls, 1);
});

test("proxy libera somente a rota exata do cron sem sessão", async () => {
  const { proxy } = loadSource("src/proxy.ts", {
    "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: null }) } }) },
    "next/server": { NextResponse: { next: () => ({ status: 200 }), redirect: () => ({ status: 307 }) } },
  }, { process: { env: {} } });
  for (const [path, expected] of [["/api/orders/confirmation-reminders", 200], ["/api/orders/confirmation-reminders/other", 307], ["/pedidos", 307]]) {
    const url = new URL(`https://loja.example${path}`);
    url.clone = () => new URL(url);
    const response = await proxy({ nextUrl: url, cookies: { getAll: () => [], set() {} } });
    assert.equal(response.status, expected, path);
  }
});
