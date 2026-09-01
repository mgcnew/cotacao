import { ClipboardCheck, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseSuggestions } from "@/components/shopping-list/purchase-suggestions";
import { ShoppingListQuickAdd } from "@/components/shopping-list/quick-add";
import { AdaptivePageSize } from "@/components/ui/adaptive-page-size";
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
  const pagination = parseListPagination(params, data.items.length, {
    pageSizeRange: { min: 1, max: 100, default: 6 },
  });
  const visibleItems = data.items.slice(pagination.start, pagination.end);

  return (
    <div className="w-full">
      <PageHeader
        title="Lista de compras"
        description="Registre o que está faltando agora; decida depois se vai cotar ou comprar direto."
      />

      {canManage ? <ShoppingListQuickAdd products={products} /> : null}

      <PurchaseSuggestions suggestions={suggestions} canManage={canManage} />

      <div className="mt-4">
        {data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nada pendente"
            description="Digite o nome de um produto ou bipe seu código de barras para começar a lista."
          />
        ) : (
          <>
            <AdaptivePageSize
              current={pagination.pageSize}
              basePath="/lista-compras"
              minRows={1}
            />
            <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-xs">
              {visibleItems.map((item) => (
                <form
                  key={item.id}
                  data-slot="adaptive-row"
                  action={updateShoppingListItem}
                  className="border-border grid gap-3 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(10rem,0.8fr)_auto] sm:items-end"
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="min-w-0">
                    <p className="text-fg truncate text-sm font-medium">
                      {item.products.name}
                    </p>
                    <p className="text-fg-subtle mt-1 text-xs">
                      Adicionado em{" "}
                      {dateTimeFormatter.format(new Date(item.created_at))}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
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
                      className="h-8"
                      disabled={!canManage}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
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
                      className="h-8"
                      disabled={!canManage}
                    />
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <Button type="submit" size="sm" variant="outline">
                        Salvar
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        formAction={removeShoppingListItem.bind(null, item.id)}
                        aria-label={`Remover ${item.products.name}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </form>
              ))}
              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={data.items.length}
                allowPageSize={false}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
