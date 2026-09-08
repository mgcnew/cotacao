import { ClipboardCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseSuggestions } from "@/components/shopping-list/purchase-suggestions";
import { ShoppingListQuickAdd } from "@/components/shopping-list/quick-add";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { getCompany } from "@/features/company/queries";
import {
  removeShoppingListItem,
  updateShoppingListItem,
} from "@/features/shopping-list/actions";
import {
  getOpenShoppingList,
  listShoppingProducts,
} from "@/features/shopping-list/queries";
import { listPurchaseSuggestions } from "@/features/shopping-list/suggestions";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { parseListPagination } from "@/lib/list-pagination";
import { cn } from "@/lib/utils";

type ListOrigin = "all" | "assistant" | "manual";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShoppingListPage({
  searchParams,
}: PageProps<"/lista-compras">) {
  const company = await requireActiveCompany();
  const [products, data, permissions, params, companyDetails, suggestions] =
    await Promise.all([
      listShoppingProducts(company.companyId),
      getOpenShoppingList(company.companyId),
      getPermissions(company.companyId),
      searchParams,
      getCompany(company.companyId),
      listPurchaseSuggestions(company.companyId),
    ]);
  const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: companyDetails.timezone,
  });
  const canManage =
    permissions.has("product.update") ||
    permissions.has("purchase_round.create") ||
    permissions.has("order.create");
  const requestedOrigin = first(params.origem);
  const origin: ListOrigin =
    requestedOrigin === "assistant" || requestedOrigin === "manual"
      ? requestedOrigin
      : "all";
  const filteredItems = data.items.filter(
    (item) => origin === "all" || item.origin === origin,
  );
  const pagination = parseListPagination(params, filteredItems.length);
  const visibleItems = filteredItems.slice(pagination.start, pagination.end);
  const originCounts = {
    all: data.items.length,
    assistant: data.items.filter((item) => item.origin === "assistant").length,
    manual: data.items.filter((item) => item.origin === "manual").length,
  };
  const hrefForOrigin = (value: ListOrigin) => {
    const query = new URLSearchParams();
    const pageSize = first(params.por_pagina);
    if (pageSize) query.set("por_pagina", pageSize);
    if (value !== "all") query.set("origem", value);
    const serialized = query.toString();
    return serialized ? `/lista-compras?${serialized}` : "/lista-compras";
  };

  return (
    <div className="w-full sm:flex sm:min-h-0 sm:flex-1 sm:flex-col">
      <PageHeader
        title="Lista de compras"
        description="Registre o que está faltando agora; decida depois se vai cotar ou comprar direto."
      />

      {canManage ? <ShoppingListQuickAdd products={products} /> : null}

      <PurchaseSuggestions suggestions={suggestions} canManage={canManage} />

      <div className="mt-4">
        {data.items.length > 0 ? (
          <nav
            aria-label="Filtrar itens por origem"
            className="mb-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
          >
            {(
              [
                { value: "all", label: "Todos", icon: ClipboardCheck },
                { value: "assistant", label: "Assistente", icon: Sparkles },
                {
                  value: "manual",
                  label: "Inseridos por você",
                  icon: UserRound,
                },
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
                  {option.label} ({originCounts[option.value]})
                </Link>
              );
            })}
          </nav>
        ) : null}

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={
              data.items.length === 0
                ? "Nada pendente"
                : "Nenhum item neste filtro"
            }
            description={
              data.items.length === 0
                ? "Digite o nome de um produto ou bipe seu código de barras para começar a lista."
                : "Escolha outra origem para ver os demais itens da lista."
            }
          />
        ) : (
          <>
            <div className="flex flex-col overflow-hidden sm:min-h-0 sm:flex-1 sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:shadow-xs">
              <div
                key={pagination.page}
                data-slot="list-scroll"
                role="region"
                aria-label="Itens da lista de compras"
                tabIndex={0}
                className="space-y-3 sm:min-h-0 sm:flex-1 sm:space-y-0 sm:overflow-y-auto sm:overscroll-contain focus-visible:outline-none"
              >
                {visibleItems.map((item) => (
                  <form
                    key={item.id}
                    action={updateShoppingListItem}
                    className="border-border bg-surface grid grid-cols-[minmax(6.5rem,0.38fr)_minmax(0,1fr)] gap-3 rounded-xl border p-4 shadow-xs sm:grid-cols-[minmax(0,1fr)_7rem_minmax(10rem,0.8fr)_auto] sm:items-end sm:rounded-none sm:border-0 sm:border-b sm:p-3 sm:shadow-none sm:last:border-b-0"
                  >
                    <input type="hidden" name="itemId" value={item.id} />
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="text-fg text-sm leading-snug font-semibold sm:truncate sm:font-medium">
                        {item.products.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium",
                            item.origin === "assistant"
                              ? "bg-primary-soft text-primary"
                              : "bg-surface-muted text-fg-muted",
                          )}
                        >
                          {item.origin === "assistant" ? (
                            <Sparkles className="size-3" aria-hidden />
                          ) : (
                            <UserRound className="size-3" aria-hidden />
                          )}
                          {item.origin === "assistant"
                            ? "Assistente"
                            : "Inserido por você"}
                        </span>
                        <span className="text-fg-subtle">
                          {dateTimeFormatter.format(new Date(item.created_at))}
                        </span>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor={`qty-${item.id}`}
                        className="text-fg-muted text-xs"
                      >
                        Quantidade ({item.purchase_unit?.symbol ?? "un"})
                      </label>
                      <Input
                        id={`qty-${item.id}`}
                        name="quantity"
                        defaultValue={String(item.requested_quantity).replace(
                          ".",
                          ",",
                        )}
                        inputMode="decimal"
                        required
                        className="h-10 text-base sm:h-8 sm:text-sm"
                        disabled={!canManage}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor={`notes-${item.id}`}
                        className="text-fg-muted text-xs"
                      >
                        Observação
                      </label>
                      <Input
                        id={`notes-${item.id}`}
                        name="notes"
                        defaultValue={item.notes ?? ""}
                        maxLength={300}
                        className="h-10 text-base sm:h-8 sm:text-sm"
                        disabled={!canManage}
                      />
                    </div>
                    {canManage ? (
                      <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 sm:col-span-1 sm:flex sm:items-center sm:gap-1">
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="h-10 sm:h-7"
                        >
                          Salvar
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className="text-destructive size-10 sm:size-auto sm:h-7"
                          formAction={removeShoppingListItem.bind(
                            null,
                            item.id,
                          )}
                          aria-label={`Remover ${item.products.name}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    ) : null}
                  </form>
                ))}
              </div>
              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={filteredItems.length}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
