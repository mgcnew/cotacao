import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const selectClass =
  "border-input bg-surface text-fg h-8 rounded-lg border px-2 text-xs outline-none";
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
type Option = { id: string; label: string };

function Options({ values, empty }: { values: Option[]; empty: string }) {
  return (
    <>
      <option value="">{empty}</option>
      {values.map((value) => (
        <option key={value.id} value={value.id}>
          {value.label}
        </option>
      ))}
    </>
  );
}

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
    <div className="w-full">
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
                className="border-border grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(10rem,1.2fr)_repeat(4,minmax(8rem,1fr))_auto] md:items-end"
              >
                <input type="hidden" name="batchId" value={batch.id} />
                <input
                  type="hidden"
                  name="sourceCategory"
                  value={mapping.source_category}
                />
                <strong className="truncate text-sm">
                  {mapping.source_category}
                </strong>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Categoria
                  <select
                    name="categoryId"
                    defaultValue={mapping.category_id ?? ""}
                    className={selectClass}
                  >
                    <Options values={categories} empty="Escolher" />
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Compra
                  <select
                    name="purchaseUnitId"
                    defaultValue={mapping.purchase_unit_id ?? ""}
                    className={selectClass}
                  >
                    <Options values={units} empty="Escolher" />
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Precificação
                  <select
                    name="pricingUnitId"
                    defaultValue={mapping.pricing_unit_id ?? ""}
                    className={selectClass}
                  >
                    <Options values={units} empty="Escolher" />
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">
                  Comparação
                  <select
                    name="comparisonUnitId"
                    defaultValue={mapping.comparison_unit_id ?? ""}
                    className={selectClass}
                  >
                    <Options values={units} empty="Opcional" />
                  </select>
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
        <select name="status" defaultValue={status} className={selectClass}>
          <option value="">Todas as situações</option>
          {Object.entries(LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">Sel.</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="hidden lg:table-cell">
                EAN / seção
              </TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-0">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const formId = `edit-${item.id}`;
              const locked =
                !editable || ["imported", "ignored"].includes(item.status);
              return (
                <TableRow
                  key={item.id}
                  className={
                    item.status === "ignored" ? "opacity-55" : undefined
                  }
                >
                  <TableCell>
                    {editable && item.status === "ready" ? (
                      <input
                        type="checkbox"
                        form="publish-import-items"
                        name="itemId"
                        value={item.id}
                        aria-label={`Selecionar ${item.proposed_name}`}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-56">
                    <Input
                      form={formId}
                      name="proposedName"
                      defaultValue={item.proposed_name}
                      disabled={locked}
                      className="h-8 font-medium"
                    />
                    <Input
                      form={formId}
                      name="barcode"
                      defaultValue={item.barcode ?? ""}
                      disabled={locked}
                      placeholder="EAN (opcional)"
                      className="mt-2 h-8 font-mono text-xs"
                    />
                    <span className="text-fg-muted mt-1 block text-xs">
                      Linha {item.source_row}
                      {item.source_code ? ` · cód. ${item.source_code}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="hidden min-w-40 lg:table-cell">
                    <span className="font-mono text-xs">
                      {item.barcode ?? "Sem EAN"}
                    </span>
                    <span className="text-fg-muted mt-1 block max-w-44 truncate text-xs">
                      {item.source_category}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <select
                      form={formId}
                      name="categoryId"
                      defaultValue={item.category_id ?? ""}
                      disabled={locked}
                      className={`${selectClass} max-w-44`}
                    >
                      <Options values={categories} empty="Escolher" />
                    </select>
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
                  </TableCell>
                  <TableCell>
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
                      <span className="text-destructive mt-1 block max-w-52 text-xs whitespace-normal">
                        {item.issues
                          .map((issue) => ISSUE[issue] ?? issue)
                          .join("; ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!locked ? (
                        <form
                          id={formId}
                          action={updateProductImportItemAction}
                        >
                          <input
                            type="hidden"
                            name="batchId"
                            value={batch.id}
                          />
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button size="sm" variant="ghost">
                            Salvar
                          </Button>
                        </form>
                      ) : null}
                      {editable && item.status !== "imported" ? (
                        <form action={toggleProductImportItemAction}>
                          <input
                            type="hidden"
                            name="batchId"
                            value={batch.id}
                          />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input
                            type="hidden"
                            name="ignore"
                            value={item.status === "ignored" ? "false" : "true"}
                          />
                          <Button size="sm" variant="ghost">
                            {item.status === "ignored"
                              ? "Restaurar"
                              : "Ignorar"}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={total}
          allowPageSize={false}
        />
      </div>
      {editable && counts.ready > 0 ? (
        <div className="bg-background/90 border-border sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t py-3 backdrop-blur">
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
