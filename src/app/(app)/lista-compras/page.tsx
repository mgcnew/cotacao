import { ClipboardCheck, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseSuggestions } from "@/components/shopping-list/purchase-suggestions";
import { DesktopListItems } from "@/components/shopping-list/desktop-list-items";
import { MobileListItems } from "@/components/shopping-list/mobile-list-items";
import type { PendingQuantity } from "@/components/shopping-list/mobile-quick-add";
import { ShoppingListQuickAdd } from "@/components/shopping-list/quick-add";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  getOpenShoppingList,
  listShoppingProducts,
} from "@/features/shopping-list/queries";
import { listPurchaseSuggestions } from "@/features/shopping-list/suggestions";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { parseListPagination } from "@/lib/list-pagination";
import { cn } from "@/lib/utils";

import Loading from "./loading";

type ListOrigin = "all" | "assistant" | "manual";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** O catálogo inteiro (mais de mil produtos com códigos) chega depois da tela. */
async function AdicionarRapido({
  companyId,
  pending,
}: {
  companyId: string;
  pending: PendingQuantity[];
}) {
  const products = await listShoppingProducts(companyId);
  return <ShoppingListQuickAdd products={products} pending={pending} />;
}

type PropsDasAbas = {
  origin: ListOrigin;
  hrefForOrigin: (value: ListOrigin) => string;
  counts: Record<ListOrigin, number>;
};

/** Espera o número de sugestões, que soma nas abas "Todos" e "Assistente". */
async function AbasComContagem({
  sugestoes,
  ...props
}: PropsDasAbas & { sugestoes: number | Promise<unknown[] | null> }) {
  const total =
    typeof sugestoes === "number"
      ? sugestoes
      : ((await sugestoes)?.length ?? null);
  return <AbasDeOrigem {...props} sugestoes={total} />;
}

/** `sugestoes` nulo: ainda não se sabe, e as abas mostram só o que já é certo. */
function AbasDeOrigem({
  origin,
  hrefForOrigin,
  counts,
  sugestoes,
}: PropsDasAbas & { sugestoes: number | null }) {
  const contar = (value: ListOrigin) => {
    if (value === "manual") return `${counts.manual}`;
    return sugestoes === null
      ? `${counts[value]}+`
      : `${counts[value] + sugestoes}`;
  };
  return (
    <nav
      data-slot="shopping-list-origin-tabs"
      aria-label="Filtrar itens por origem"
      className="-mb-4 flex gap-2 overflow-x-auto pb-4 sm:mb-0 sm:flex-wrap sm:overflow-visible sm:pb-0"
    >
      {(
        [
          { value: "all", label: "Todos", icon: ClipboardCheck },
          { value: "assistant", label: "Assistente", icon: Sparkles },
          { value: "manual", label: "Inseridos por você", icon: UserRound },
        ] as const
      ).map((option) => {
        const Icon = option.icon;
        return (
          <Link
            key={option.value}
            href={hrefForOrigin(option.value)}
            aria-current={origin === option.value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:h-8",
              origin === option.value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {option.label} ({contar(option.value)})
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A casca só lê o recorte (origem, página) e o usa de `key`: trocar de aba
 * devolve o esqueleto, em vez de deixar a lista anterior parada até a nova
 * chegar.
 */
export default async function ShoppingListPage({
  searchParams,
}: PageProps<"/lista-compras">) {
  const recorte = await searchParams;

  return (
    <Suspense key={JSON.stringify(recorte)} fallback={<Loading />}>
      <ListaDeComprasConteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function ListaDeComprasConteudo({
  searchParams,
}: Pick<PageProps<"/lista-compras">, "searchParams">) {
  const company = await requireActiveCompany();
  // Começam já, mas só travam a tela quando ela as mostra (abas "Todos" e
  // "Assistente"). Na aba padrão elas só alimentam o número das abas, que chega
  // depois: a lista não espera por uma consulta que ela não desenha.
  const sugestoes = listPurchaseSuggestions(company.companyId);
  const sugestoesParaContagem = sugestoes.catch(() => null);
  const [data, permissions, params] = await Promise.all([
    getOpenShoppingList(company.companyId),
    getPermissions(company.companyId),
    searchParams,
  ]);
  const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: company.companyTimezone,
  });
  const canManage =
    permissions.has("product.update") ||
    permissions.has("purchase_round.create") ||
    permissions.has("order.create");
  const requestedOrigin = first(params.origem);
  const origin: ListOrigin =
    requestedOrigin === "assistant" || requestedOrigin === "all"
      ? requestedOrigin
      : "manual";
  const assistantItems = data.items.filter(
    (item) => item.origin === "assistant",
  );
  const manualItems = data.items.filter((item) => item.origin === "manual");
  const filteredItems = data.items.filter(
    (item) => origin === "all" || item.origin === origin,
  );
  const showSuggestions = origin === "all" || origin === "assistant";
  const suggestions = showSuggestions ? await sugestoes : [];
  const pagination = parseListPagination(params, filteredItems.length);
  const visibleItems = filteredItems.slice(pagination.start, pagination.end);
  const rows = visibleItems.map((item) => ({
    id: item.id,
    productId: item.product_id,
    name: item.products.name,
    origin: item.origin === "assistant" ? ("assistant" as const) : ("manual" as const),
    createdLabel: dateTimeFormatter.format(new Date(item.created_at)),
    quantity: Number(item.requested_quantity),
    unit: item.purchase_unit?.symbol ?? "un",
    notes: item.notes ?? "",
  }));
  const hasVisibleSuggestions = showSuggestions && suggestions.length > 0;
  const hrefForOrigin = (value: ListOrigin) => {
    const query = new URLSearchParams();
    const pageSize = first(params.por_pagina);
    if (pageSize) query.set("por_pagina", pageSize);
    if (value !== "manual") query.set("origem", value);
    const serialized = query.toString();
    return serialized ? `/lista-compras?${serialized}` : "/lista-compras";
  };
  const contagemBase = {
    all: data.items.length,
    assistant: assistantItems.length,
    manual: manualItems.length,
  };

  return (
    <div className="w-full sm:flex sm:min-h-0 sm:flex-1 sm:flex-col">
      <PageHeader
        title="Lista de compras"
        info="Registre o que está faltando agora; decida depois se vai cotar ou comprar direto."
      />

      {canManage ? (
        <Suspense
          fallback={<Skeleton className="h-12 w-full rounded-xl sm:h-14" />}
        >
          <AdicionarRapido
            companyId={company.companyId}
            pending={data.items.map((item) => ({
              productId: item.product_id,
              quantity: Number(item.requested_quantity),
            }))}
          />
        </Suspense>
      ) : null}

      <div className="mt-4 overflow-hidden sm:overflow-visible">
        <Suspense
          fallback={
            <AbasDeOrigem
              origin={origin}
              hrefForOrigin={hrefForOrigin}
              counts={contagemBase}
              sugestoes={null}
            />
          }
        >
          <AbasComContagem
            origin={origin}
            hrefForOrigin={hrefForOrigin}
            counts={contagemBase}
            sugestoes={
              showSuggestions ? suggestions.length : sugestoesParaContagem
            }
          />
        </Suspense>
      </div>

      {showSuggestions ? (
        <PurchaseSuggestions suggestions={suggestions} canManage={canManage} />
      ) : null}

      <div className="mt-4">
        {filteredItems.length === 0 && !hasVisibleSuggestions ? (
          <EmptyState
            icon={origin === "assistant" ? Sparkles : ClipboardCheck}
            title={
              origin === "assistant"
                ? "Nenhuma sugestão pendente"
                : origin === "manual"
                  ? "Nenhum item inserido por você"
                  : "Nada pendente"
            }
            description={
              origin === "assistant"
                ? "Quando o histórico identificar uma reposição, ela aparecerá aqui."
                : "Digite o nome de um produto ou bipe seu código de barras para começar a lista."
            }
          />
        ) : filteredItems.length > 0 ? (
          <>
            <div className="flex flex-col overflow-hidden sm:min-h-0 sm:flex-1 sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:shadow-xs">
              <div
                key={pagination.page}
                data-slot="list-scroll"
                role="region"
                aria-label="Itens da lista de compras"
                tabIndex={0}
                className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain focus-visible:outline-none"
              >
                <MobileListItems canManage={canManage} items={rows} />
                <DesktopListItems canManage={canManage} items={rows} />
              </div>
              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={filteredItems.length}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
