"use client";

import { Clock3, Flag, Lock, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { CotaProLogo } from "@/components/brand/cotapro-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  describeLocations,
  formatCountQuantity,
  itemTotal,
  sortCountItems,
} from "@/features/stock-counts/message";
import type { PublicStockCount } from "@/features/stock-counts/public";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  name: string;
  category: string;
  unit: string;
  needsRecount: boolean;
  entries: { quantity: number; location: string | null; createdAt: string }[];
};

type Order = "recent" | "category";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * A contagem aberta pelo link da mensagem, só leitura.
 *
 * Mesma ordem da tela de quem conta (recontar no topo, depois os mais
 * recentes) e, para bater com o sistema, a opção de ver por categoria como na
 * mensagem. Recarrega sozinha a cada minuto enquanto está visível: quem confere
 * acompanha a recontagem sem pedir um link novo.
 */
export function PublicCount({ data }: { data: PublicStockCount }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order>("recent");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh());
      }
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  const items = useMemo<Item[]>(
    () =>
      data.items.map((item) => ({
        id: item.product_id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        needsRecount: item.needs_recount,
        entries: item.entries.map((entry) => ({
          quantity: entry.quantity,
          location: entry.location,
          createdAt: entry.created_at,
        })),
      })),
    [data.items],
  );

  const visible = useMemo(() => {
    const search = normalize(query.trim());
    const filtered = search
      ? items.filter((item) =>
          normalize(`${item.name} ${item.category}`).includes(search),
        )
      : items;
    return sortCountItems(filtered);
  }, [items, query]);

  const groups = useMemo(() => {
    if (order === "recent") return [{ title: null, items: visible }];
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
    const byCategory = new Map<string, Item[]>();
    for (const item of visible) {
      byCategory.set(item.category, [
        ...(byCategory.get(item.category) ?? []),
        item,
      ]);
    }
    return [...byCategory]
      .sort(([a], [b]) => collator.compare(a, b))
      .map(([title, list]) => ({
        title,
        items: list.sort((a, b) => collator.compare(a.name, b.name)),
      }));
  }, [order, visible]);

  const timeZone = data.company.timezone;
  const title =
    data.name ??
    `Contagem de ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone }).format(new Date(data.created_at))}`;
  const startedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(data.created_at));
  const refreshedAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(data.generated_at));
  const counted = items.filter((item) => item.entries.length > 0).length;
  const toRecount = items.filter((item) => item.needsRecount).length;

  return (
    <main className="bg-surface-sunken min-h-dvh pb-10">
      <header className="border-border bg-surface sticky top-0 z-10 border-b shadow-xs">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <CotaProLogo compact />
          <div className="border-border min-w-0 flex-1 border-l pl-3">
            <p className="text-fg truncate text-sm font-semibold">
              {data.company.name}
            </p>
            <p className="text-fg-muted text-xs">Contagem de estoque</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-label="Atualizar contagem"
            className="h-10 sm:h-8"
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

      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-fg text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </h1>
            {data.status === "closed" ? (
              <span className="bg-surface-muted text-fg-muted inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs">
                <Lock className="size-3" aria-hidden /> Finalizada
              </span>
            ) : (
              <span className="bg-primary-soft text-primary rounded-sm px-1.5 py-0.5 text-xs font-medium">
                Em andamento
              </span>
            )}
          </div>
          <p className="text-fg-muted text-sm">
            {startedAt}
            {data.author ? ` · contado por ${data.author}` : ""}
          </p>
          <p className="text-fg-muted flex flex-wrap items-center gap-x-2 text-sm">
            <span>
              {counted === 1 ? "1 produto contado" : `${counted} produtos contados`}
            </span>
            {toRecount > 0 ? (
              <span className="text-warning inline-flex items-center gap-1 font-medium">
                <Flag className="size-3.5" aria-hidden />
                {toRecount === 1 ? "1 para recontar" : `${toRecount} para recontar`}
              </span>
            ) : null}
          </p>
          <p className="text-fg-subtle mt-1 flex items-center gap-1.5 text-xs">
            <Clock3 className="size-3.5" aria-hidden />
            Atualizado às {refreshedAt}
            {data.status === "open" ? " · atualiza sozinho a cada minuto" : ""}
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Buscar produto</span>
            <Search
              className="text-fg-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar produto ou categoria"
              className="bg-surface h-11 pl-9 text-base sm:text-sm"
            />
          </label>
          <div
            role="radiogroup"
            aria-label="Ordem da lista"
            className="border-border bg-surface grid h-11 shrink-0 grid-cols-2 rounded-lg border p-1"
          >
            {(
              [
                ["recent", "Mais recentes"],
                ["category", "Por categoria"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={order === value}
                onClick={() => setOrder(value)}
                className={cn(
                  "rounded-md px-3 text-sm transition-colors",
                  order === value
                    ? "bg-primary-soft text-primary font-medium"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="border-border bg-surface text-fg-muted rounded-xl border border-dashed px-6 py-12 text-center text-sm">
            {items.length === 0
              ? "Nenhum produto contado ainda."
              : `Nenhum produto com “${query.trim()}”.`}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <section key={group.title ?? "todos"} aria-label={group.title ?? "Produtos"}>
                {group.title ? (
                  <h2 className="text-fg-muted mb-2 px-1 text-xs font-semibold tracking-wide uppercase">
                    {group.title}
                  </h2>
                ) : null}
                <ul className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
                  {group.items.map((item) => (
                    <PublicRow
                      key={item.id}
                      item={item}
                      showCategory={order === "recent"}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PublicRow({
  item,
  showCategory,
}: {
  item: Item;
  showCategory: boolean;
}) {
  const waiting = item.entries.length === 0;
  const details = [
    showCategory ? item.category : null,
    waiting ? "Aguardando a recontagem" : describeLocations(item.entries).join(" + "),
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "border-border flex min-h-16 items-center gap-3 border-b px-4 py-2.5 last:border-b-0",
        item.needsRecount &&
          "bg-warning-soft/60 shadow-[inset_3px_0_0_var(--color-warning)]",
      )}
    >
      <div className="min-w-0 flex-1">
        {item.needsRecount ? (
          <p className="text-warning mb-0.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
            <Flag className="size-3" aria-hidden /> Recontar
          </p>
        ) : null}
        <p className="text-fg line-clamp-2 text-sm leading-snug font-semibold">
          {item.name}
        </p>
        <p className="text-fg-subtle mt-0.5 truncate text-xs">
          {details.join(" · ")}
        </p>
      </div>
      <p className="text-fg shrink-0 text-right text-lg font-bold tabular-nums">
        {waiting ? (
          <span className="text-fg-subtle font-semibold">—</span>
        ) : (
          <>
            {formatCountQuantity(itemTotal(item.entries))}
            <span className="text-fg-muted ml-1 text-xs font-normal">
              {item.unit}
            </span>
          </>
        )}
      </p>
    </li>
  );
}
