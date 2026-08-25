import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  applyProductImportMappingAction,
  publishProductImportItemsAction,
  toggleProductImportItemAction,
  updateProductImportItemAction,
} from "@/features/products/import-actions";
import {
  countProductImportItems,
  getProductImportBatch,
  listProductImportItems,
} from "@/features/products/import-queries";
import { listCategories, listUnits } from "@/features/products/queries";
import { requireActiveCompany } from "@/lib/auth/dal";
import {
  normalizeListSearch,
  parseListPagination,
} from "@/lib/list-pagination";

const LABEL: Record<string, string> = {
  pending: "Pendente",
  ready: "Pronto",
  blocked: "Bloqueado",
  ignored: "Ignorado",
  imported: "Importado",
  error: "Erro",
};
const ISSUE: Record<string, string> = {
  name_too_long: "Nome muito longo",
  invalid_name: "Nome inválido",
  invalid_barcode: "Código inválido",
  duplicate_name_file: "Nome repetido na planilha",
  duplicate_barcode_file: "Código repetido na planilha",
  duplicate_name_catalog: "Nome já cadastrado",
  duplicate_barcode_catalog: "Código já cadastrado",
};
export default async function ProductImportDetailPage({
  params,
  searchParams,
}: PageProps<"/produtos/importacoes/[id]">) {
  const [{ id }, query, company] = await Promise.all([
    params,
    searchParams,
    requireActiveCompany(),
  ]);
  const [{ batch, mappings }, rawCategories, rawUnits] = await Promise.all([
    getProductImportBatch(company.companyId, id),
    listCategories(company.companyId),
    listUnits(company.companyId),
  ]);
  if (!batch) notFound();
  const categories = rawCategories
    .filter((item) => item.isActive)
    .map((item) => ({ id: item.id, label: item.name }));
  const units = rawUnits
    .filter((item) => item.is_active)
    .map((item) => ({ id: item.id, label: `${item.code} — ${item.name}` }));
  const search = String(
    (Array.isArray(query.busca) ? query.busca[0] : query.busca) ?? "",
  ).trim();
  const status = String(
    (Array.isArray(query.status) ? query.status[0] : query.status) ?? "",
  );
  const rawPage = Number(
    Array.isArray(query.pagina) ? query.pagina[0] : query.pagina,
  );
  const requestedPage = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1;
  const [{ items, total, page }, counts] = await Promise.all([
    listProductImportItems(company.companyId, id, {
      search: normalizeListSearch(search),
      status,
      page: requestedPage,
      pageSize: 50,
    }),
    countProductImportItems(company.companyId, id),
  ]);
  const pagination = parseListPagination(
    { ...query, pagina: String(page) },
    total,
    {
      pageSizeRange: { min: 1, max: 100, default: 50 },
    },
  );
  const error =
    (Array.isArray(query.erro) ? query.erro[0] : query.erro) ?? null;
  const success =
    (Array.isArray(query.sucesso) ? query.sucesso[0] : query.sucesso) ?? null;
  const editable = batch.status === "draft";

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title={batch.file_name}
        description={`${batch.total_rows.toLocaleString("pt-BR")} produtos · aba ${batch.sheet_name ?? "principal"}`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/produtos/importacoes">Voltar</Link>
          </Button>
        }
      />
      {error ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3 text-sm">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="border-primary/30 bg-primary/10 mb-4 rounded-lg border p-3 text-sm">
          {success} produto(s) publicado(s).
        </p>
      ) : null}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(counts).map(([key, count]) => (
          <div
            key={key}
            className="border-border bg-surface rounded-lg border p-3"
          >
            <span className="text-fg-muted block text-xs">{LABEL[key]}</span>
            <strong className="text-lg">{count}</strong>
          </div>
        ))}
      </div>

      {editable ? (
        <details
          className="border-border bg-surface mb-5 rounded-xl border p-4"
          open={mappings.some((item) => !item.category_id)}
        >
          <summary className="cursor-pointer font-medium">
            Mapear as {mappings.length} seções
          </summary>
          <p className="text-fg-muted mt-1 text-xs">
            Aplique categoria e unidades a todos os itens ainda em rascunho da
            seção.
          </p>
          <div className="mt-4 grid gap-2">
            {mappings.map((mapping) => (
              <form
                key={mapping.id}
                action={applyProductImportMappingAction}
                className="border-border grid gap-3 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,1.2fr)_repeat(4,minmax(8rem,1fr))_auto] xl:items-end"
              >
                <input type="hidden" name="batchId" value={batch.id} />
                <input
                  type="hidden"
                  name="sourceCategory"
                  value={mapping.source_category}
                />
                <strong className="truncate text-sm sm:col-span-2 xl:col-span-1">
                  {mapping.source_category}
                </strong>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Categoria
                  <ThemedSelect
                    id={`mapping-category-${mapping.id}`}
                    name="categoryId"
                    defaultValue={mapping.category_id ?? ""}
                    placeholder="Escolher"
                    options={categories.map((category) => ({
                      value: category.id,
                      label: category.label,
                    }))}
                  />
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Compra
                  <ThemedSelect
                    id={`mapping-purchase-${mapping.id}`}
                    name="purchaseUnitId"
                    defaultValue={mapping.purchase_unit_id ?? ""}
                    placeholder="Escolher"
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: unit.label,
                    }))}
                  />
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Precificação
                  <ThemedSelect
                    id={`mapping-pricing-${mapping.id}`}
                    name="pricingUnitId"
                    defaultValue={mapping.pricing_unit_id ?? ""}
                    placeholder="Escolher"
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: unit.label,
                    }))}
                  />
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Comparação
                  <ThemedSelect
                    id={`mapping-comparison-${mapping.id}`}
                    name="comparisonUnitId"
                    defaultValue={mapping.comparison_unit_id ?? ""}
                    placeholder="Opcional"
                    emptyOptionLabel="Sem unidade própria"
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: unit.label,
                    }))}
                  />
                </label>
                <Button size="sm" variant="outline">
                  Aplicar
                </Button>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      <form
        method="get"
        className="mb-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]"
      >
        <Input
          name="busca"
          defaultValue={search}
          placeholder="Buscar nome, código ou EAN"
        />
        <ThemedSelect
          id="import-status"
          name="status"
          defaultValue={status}
          placeholder="Todas as situações"
          emptyOptionLabel="Todas as situações"
          options={Object.entries(LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Button variant="outline">Filtrar</Button>
      </form>
      {editable ? (
        <form
          id="publish-import-items"
          action={publishProductImportItemsAction}
        >
          <input type="hidden" name="batchId" value={batch.id} />
        </form>
      ) : null}
      <div className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
        <div className="border-border bg-surface-sunken hidden grid-cols-[1.5rem_minmax(16rem,2fr)_minmax(11rem,0.8fr)_minmax(10rem,0.75fr)_minmax(9rem,0.65fr)_auto] gap-3 border-b px-3 py-2.5 text-xs font-medium xl:grid">
          <span>Sel.</span>
          <span>Produto</span>
          <span>EAN / seção</span>
          <span>Categoria</span>
          <span>Situação</span>
          <span>Ações</span>
        </div>
        <div className="divide-border divide-y">
          {items.map((item) => {
            const formId = `edit-${item.id}`;
            const locked =
              !editable || ["imported", "ignored"].includes(item.status);
            return (
              <article
                key={item.id}
                className={`grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 p-3 xl:grid-cols-[1.5rem_minmax(16rem,2fr)_minmax(11rem,0.8fr)_minmax(10rem,0.75fr)_minmax(9rem,0.65fr)_auto] xl:items-start ${item.status === "ignored" ? "opacity-55" : ""}`}
              >
                <div className="pt-7 xl:pt-2">
                  {editable && item.status === "ready" ? (
                    <input
                      type="checkbox"
                      form="publish-import-items"
                      name="itemId"
                      value={item.id}
                      aria-label={`Selecionar ${item.proposed_name}`}
                    />
                  ) : null}
                </div>

                <div className="min-w-0">
                  <label className="text-fg-muted mb-1 block text-[10px] font-medium uppercase xl:hidden">
                    Produto
                  </label>
                  <Input
                    form={formId}
                    name="proposedName"
                    defaultValue={item.proposed_name}
                    disabled={locked}
                    className="block h-8 font-medium"
                  />
                  <span className="text-fg-muted mt-1 block truncate text-xs">
                    Linha {item.source_row}
                    {item.source_code ? ` · cód. ${item.source_code}` : ""}
                  </span>
                </div>

                <div className="col-start-2 min-w-0 xl:col-start-auto">
                  <label className="text-fg-muted mb-1 block text-[10px] font-medium uppercase xl:hidden">
                    EAN / seção
                  </label>
                  <Input
                    form={formId}
                    name="barcode"
                    defaultValue={item.barcode ?? ""}
                    disabled={locked}
                    placeholder="EAN (opcional)"
                    className="block h-8 font-mono text-xs"
                  />
                  <span
                    className="text-fg-muted mt-1 block truncate text-xs"
                    title={item.source_category}
                  >
                    {item.source_category}
                  </span>
                </div>

                <div className="col-start-2 min-w-0 xl:col-start-auto">
                  <label className="text-fg-muted mb-1 block text-[10px] font-medium uppercase xl:hidden">
                    Categoria
                  </label>
                  <ThemedSelect
                    id={`category-${item.id}`}
                    form={formId}
                    name="categoryId"
                    defaultValue={item.category_id ?? ""}
                    disabled={locked}
                    placeholder="Escolher"
                    options={categories.map((category) => ({
                      value: category.id,
                      label: category.label,
                    }))}
                  />
                  <input
                    form={formId}
                    type="hidden"
                    name="purchaseUnitId"
                    value={item.purchase_unit_id ?? ""}
                  />
                  <input
                    form={formId}
                    type="hidden"
                    name="pricingUnitId"
                    value={item.pricing_unit_id ?? ""}
                  />
                  <input
                    form={formId}
                    type="hidden"
                    name="comparisonUnitId"
                    value={item.comparison_unit_id ?? ""}
                  />
                </div>

                <div className="col-start-2 min-w-0 xl:col-start-auto xl:pt-1">
                  <label className="text-fg-muted mb-1 block text-[10px] font-medium uppercase xl:hidden">
                    Situação
                  </label>
                  <Badge
                    variant={
                      item.status === "ready" || item.status === "imported"
                        ? "default"
                        : item.status === "blocked" || item.status === "error"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {LABEL[item.status] ?? item.status}
                  </Badge>
                  {item.issues.length ? (
                    <span className="text-destructive mt-1 block text-xs whitespace-normal">
                      {item.issues
                        .map((issue) => ISSUE[issue] ?? issue)
                        .join("; ")}
                    </span>
                  ) : null}
                </div>

                <div className="col-start-2 flex flex-wrap gap-1 xl:col-start-auto">
                  {!locked ? (
                    <form id={formId} action={updateProductImportItemAction}>
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Button size="sm" variant="outline">
                        Salvar
                      </Button>
                    </form>
                  ) : null}
                  {editable && item.status !== "imported" ? (
                    <form action={toggleProductImportItemAction}>
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input
                        type="hidden"
                        name="ignore"
                        value={item.status === "ignored" ? "false" : "true"}
                      />
                      <Button size="sm" variant="ghost">
                        {item.status === "ignored" ? "Restaurar" : "Ignorar"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={total}
          allowPageSize={false}
        />
      </div>
      {editable && counts.ready > 0 ? (
        <div className="border-border bg-surface mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-3 shadow-xs">
          <p className="text-fg-muted text-xs">
            Marque até 100 itens prontos desta página.
          </p>
          <Button type="submit" form="publish-import-items">
            Publicar selecionados
          </Button>
        </div>
      ) : null}
    </div>
  );
}
