"use client";

import {
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  PackageCheck,
  RefreshCw,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { CotaProLogo } from "@/components/brand/cotapro-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  PublicReceivingDisplay,
  PublicReceivingDisplayOrder,
} from "@/features/receipts/public-display";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return DATE.format(new Date(year, month - 1, day));
}

function deliveryLabel(date: string | null, today: string) {
  if (!date) return { label: "Sem data", tone: "outline" as const };
  if (date < today) {
    return { label: `Atrasada · ${formatDate(date)}`, tone: "destructive" as const };
  }
  if (date === today) {
    return { label: "Chega hoje", tone: "secondary" as const };
  }
  return { label: formatDate(date), tone: "outline" as const };
}

type SupplierGroup = {
  id: string;
  name: string;
  orders: PublicReceivingDisplayOrder[];
};

function groupBySupplier(orders: PublicReceivingDisplayOrder[]) {
  const groups = new Map<string, SupplierGroup>();
  for (const order of orders) {
    const current = groups.get(order.supplier_id) ?? {
      id: order.supplier_id,
      name: order.supplier_name,
      orders: [],
    };
    current.orders.push(order);
    groups.set(order.supplier_id, current);
  }
  return [...groups.values()];
}

export function PublicReceivingDisplay({
  data,
}: {
  data: PublicReceivingDisplay;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.company.timezone,
  }).format(new Date());

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh());
      }
    };
    const timer = window.setInterval(refresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  const suppliers = useMemo(() => {
    const search = normalize(query.trim());
    const filtered = !search
      ? data.orders
      : data.orders.flatMap((order) => {
          const orderMatches = normalize(
            `${order.supplier_name} ${order.order_number}`,
          ).includes(search);
          const items = orderMatches
            ? order.items
            : order.items.filter((item) =>
                normalize(item.product_name).includes(search),
              );
          return items.length ? [{ ...order, items }] : [];
        });
    return groupBySupplier(filtered);
  }, [data.orders, query]);

  const refreshedAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data.generated_at));

  return (
    <main className="bg-surface-sunken min-h-dvh pb-10">
      <header className="border-border bg-surface sticky top-0 z-10 border-b shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <CotaProLogo compact />
          <div className="border-border min-w-0 flex-1 border-l pl-3">
            <p className="text-fg truncate text-sm font-semibold">
              {data.company.name}
            </p>
            <p className="text-fg-muted text-xs">Painel de recebimento</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-label="Atualizar entregas"
            onClick={() => startTransition(() => router.refresh())}
          >
            <RefreshCw
              className={isPending ? "animate-spin" : undefined}
              aria-hidden
            />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight sm:text-2xl">
            Próximas entregas
          </h1>
          <p className="text-fg-muted text-sm">
            Confira produtos, saldos pendentes e preços negociados.
          </p>
          <p className="text-fg-subtle mt-1 flex items-center gap-1.5 text-xs">
            <Clock3 className="size-3.5" aria-hidden />
            Atualizado às {refreshedAt} · atualização automática a cada minuto
          </p>
        </div>

        <label className="relative mb-4 block">
          <span className="sr-only">Buscar entrega</span>
          <Search
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar fornecedor, pedido ou produto"
            className="bg-surface h-11 pl-9 text-base"
          />
        </label>

        {suppliers.length ? (
          <div className="space-y-3">
            {suppliers.map((supplier) => {
              const itemCount = supplier.orders.reduce(
                (total, order) => total + order.items.length,
                0,
              );
              const hasToday = supplier.orders.some(
                (order) => order.delivery_due_date === today,
              );
              const hasLate = supplier.orders.some(
                (order) =>
                  order.delivery_due_date && order.delivery_due_date < today,
              );

              return (
                <details
                  key={supplier.id}
                  open={Boolean(query)}
                  className="border-border bg-surface group overflow-hidden rounded-xl border shadow-xs"
                >
                  <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                    <span className="bg-primary-soft text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                      <Building2 className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block truncate font-semibold">
                        {supplier.name}
                      </span>
                      <span className="text-fg-muted block text-xs">
                        {supplier.orders.length}{" "}
                        {supplier.orders.length === 1 ? "pedido" : "pedidos"} ·{" "}
                        {itemCount} {itemCount === 1 ? "produto" : "produtos"}
                      </span>
                    </span>
                    {hasLate ? (
                      <Badge variant="destructive">Atrasada</Badge>
                    ) : hasToday ? (
                      <Badge variant="secondary">Hoje</Badge>
                    ) : null}
                    <ChevronDown
                      className="text-fg-subtle size-5 shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>

                  <div className="divide-border border-border divide-y border-t">
                    {supplier.orders.map((order) => {
                      const delivery = deliveryLabel(
                        order.delivery_due_date,
                        today,
                      );
                      return (
                        <section key={order.order_number} className="p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-fg text-sm font-semibold">
                              Pedido #{order.order_number}
                            </p>
                            <Badge variant={delivery.tone}>
                              <CalendarDays aria-hidden /> {delivery.label}
                            </Badge>
                          </div>
                          <ul className="divide-border divide-y">
                            {order.items.map((item) => (
                              <li
                                key={item.item_id}
                                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                              >
                                <div className="min-w-0">
                                  <p className="text-fg text-sm font-medium">
                                    {item.product_name}
                                  </p>
                                  {item.received_quantity > 0 ? (
                                    <p className="text-fg-subtle mt-0.5 text-xs">
                                      Pedido: {QTY.format(item.requested_quantity)} · já recebido: {QTY.format(item.received_quantity)} {item.purchase_unit}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex items-end justify-between gap-4 sm:block sm:text-right">
                                  <p className="text-fg text-sm tabular-nums">
                                    <strong>{QTY.format(item.pending_quantity)}</strong>{" "}
                                    {item.purchase_unit} pendente
                                  </p>
                                  <p className="text-fg-muted text-xs tabular-nums">
                                    {MONEY.format(item.agreed_price)} por {item.pricing_unit}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="border-border bg-surface flex flex-col items-center rounded-xl border px-5 py-12 text-center">
            <span className="bg-success-soft text-success grid size-12 place-items-center rounded-full">
              <PackageCheck className="size-6" aria-hidden />
            </span>
            <p className="text-fg mt-3 font-medium">
              {query ? "Nenhum resultado encontrado" : "Nenhuma entrega pendente"}
            </p>
            <p className="text-fg-muted mt-1 max-w-sm text-sm">
              {query
                ? "Tente buscar por outro fornecedor, número de pedido ou produto."
                : "Quando um pedido for confirmado, ele aparecerá aqui automaticamente."}
            </p>
          </div>
        )}

        <p className="text-fg-subtle mt-6 text-center text-xs">
          Painel somente para consulta. O recebimento oficial continua sendo
          registrado no sistema.
        </p>
      </div>
    </main>
  );
}
