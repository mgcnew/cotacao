"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  updateUnusedProductUnitsBulk,
  type BulkProductUnitEditState,
} from "@/features/products/actions";
import type { EditableProductUnitRow } from "@/features/products/queries";

type UnitOption = { id: string; label: string; code: string };
type UnitConfiguration = {
  purchaseUnitId: string;
  pricingUnitId: string;
  comparisonUnitId: string | null;
};

const KEEP = "__keep__";
const NONE = "__none__";
const PAGE_SIZE = 50;
const INITIAL_STATE: BulkProductUnitEditState = { error: null };

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function originalConfiguration(
  product: EditableProductUnitRow,
): UnitConfiguration {
  return {
    purchaseUnitId: product.purchaseUnitId,
    pricingUnitId: product.pricingUnitId,
    comparisonUnitId: product.comparisonUnitId,
  };
}

function configurationsMatch(
  left: UnitConfiguration,
  right: UnitConfiguration,
) {
  return (
    left.purchaseUnitId === right.purchaseUnitId &&
    left.pricingUnitId === right.pricingUnitId &&
    left.comparisonUnitId === right.comparisonUnitId
  );
}

function SaveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending
        ? "Salvando…"
        : `Salvar ${count} ${count === 1 ? "alteração" : "alterações"}`}
    </Button>
  );
}

export function BulkProductUnitEditor({
  products,
  units,
  lockedCount,
  inModal = false,
}: {
  products: EditableProductUnitRow[];
  units: UnitOption[];
  lockedCount: number;
  inModal?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [currentUnitId, setCurrentUnitId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = React.useState<Record<string, UnitConfiguration>>(
    {},
  );
  const [purchaseChoice, setPurchaseChoice] = React.useState(KEEP);
  const [pricingChoice, setPricingChoice] = React.useState(KEEP);
  const [comparisonChoice, setComparisonChoice] = React.useState(KEEP);
  const [appliedCount, setAppliedCount] = React.useState(0);
  const deferredSearch = React.useDeferredValue(search);

  const productsById = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const unitById = React.useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );
  const categories = React.useMemo(
    () =>
      Array.from(
        new Map(
          products.map((product) => [
            product.categoryId,
            product.categoryName,
          ]),
        ),
      )
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [products],
  );

  const filtered = React.useMemo(() => {
    const term = normalized(deferredSearch.trim());
    return products.filter(
      (product) =>
        (!term || normalized(product.name).includes(term)) &&
        (!categoryId || product.categoryId === categoryId) &&
        (!currentUnitId || product.purchaseUnitId === currentUnitId) &&
        (!status || (status === "active") === product.isActive),
    );
  }, [categoryId, currentUnitId, deferredSearch, products, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (effectivePage - 1) * PAGE_SIZE,
    effectivePage * PAGE_SIZE,
  );
  const allVisibleSelected =
    visible.length > 0 && visible.every((product) => selected.has(product.id));
  const changes = React.useMemo(
    () =>
      Object.entries(drafts).map(([productId, configuration]) => ({
        productId,
        ...configuration,
      })),
    [drafts],
  );

  const action = React.useCallback(
    async (previous: BulkProductUnitEditState, formData: FormData) => {
      const result = await updateUnusedProductUnitsBulk(previous, formData);
      if (!result.error) {
        setDrafts({});
        setSelected(new Set());
        setAppliedCount(0);
      }
      return result;
    },
    [],
  );
  const [state, formAction] = React.useActionState(action, INITIAL_STATE);

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const product of visible) {
        if (allVisibleSelected) next.delete(product.id);
        else next.add(product.id);
      }
      return next;
    });
  }

  function toggleProduct(productId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function applyToSelected() {
    if (
      selected.size === 0 ||
      (purchaseChoice === KEEP &&
        pricingChoice === KEEP &&
        comparisonChoice === KEEP)
    ) {
      return;
    }

    let quantity = 0;
    setDrafts((current) => {
      const next = { ...current };
      for (const productId of selected) {
        const product = productsById.get(productId);
        if (!product) continue;
        const original = originalConfiguration(product);
        const present = next[productId] ?? original;
        const updated: UnitConfiguration = {
          purchaseUnitId:
            purchaseChoice === KEEP
              ? present.purchaseUnitId
              : purchaseChoice,
          pricingUnitId:
            pricingChoice === KEEP ? present.pricingUnitId : pricingChoice,
          comparisonUnitId:
            comparisonChoice === KEEP
              ? present.comparisonUnitId
              : comparisonChoice === NONE
                ? null
                : comparisonChoice,
        };

        if (configurationsMatch(updated, original)) delete next[productId];
        else next[productId] = updated;
        quantity += 1;
      }
      return next;
    });
    setAppliedCount(quantity);
    setSelected(new Set());
  }

  function undo(productId: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  const applicationDisabled =
    selected.size === 0 ||
    (purchaseChoice === KEEP &&
      pricingChoice === KEEP &&
      comparisonChoice === KEEP);
  const unitOptions = units.map((unit) => ({
    value: unit.id,
    label: unit.label,
  }));
  const keepOptions = [{ value: KEEP, label: "Manter como está" }, ...unitOptions];
  const comparisonOptions = [
    { value: KEEP, label: "Manter como está" },
    { value: NONE, label: "Usar a unidade de precificação" },
    ...unitOptions,
  ];

  const content = (
    <div className="space-y-4">
      <div className="border-border bg-surface-sunken rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fg text-sm font-medium">
            {products.length} produtos disponíveis para correção
          </p>
          {lockedCount > 0 ? (
            <span className="text-fg-muted text-xs">
              {lockedCount} protegidos por já possuírem movimentação
            </span>
          ) : null}
        </div>
        <p className="text-fg-muted mt-1 text-xs">
          Os produtos protegidos não aparecem para seleção e não terão o
          histórico alterado. Nas configurações, a ordem é compra ·
          precificação · comparação.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-fg-muted grid gap-1 text-xs">
          Buscar produto
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nome do produto"
          />
        </label>
        <label className="text-fg-muted grid gap-1 text-xs">
          Categoria
          <ThemedSelect
            id="bulk-unit-category"
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              setPage(1);
            }}
            emptyOptionLabel="Todas as categorias"
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
          />
        </label>
        <label className="text-fg-muted grid gap-1 text-xs">
          Unidade de compra atual
          <ThemedSelect
            id="bulk-current-unit"
            value={currentUnitId}
            onValueChange={(value) => {
              setCurrentUnitId(value);
              setPage(1);
            }}
            emptyOptionLabel="Todas as unidades"
            options={unitOptions}
          />
        </label>
        <label className="text-fg-muted grid gap-1 text-xs">
          Situação
          <ThemedSelect
            id="bulk-product-status"
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            emptyOptionLabel="Ativos e inativos"
            options={[
              { value: "active", label: "Somente ativos" },
              { value: "inactive", label: "Somente inativos" },
            ]}
          />
        </label>
      </div>

      <div className="border-primary-line bg-primary-soft rounded-lg border p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-fg-muted grid gap-1 text-xs">
            Nova unidade de compra
            <ThemedSelect
              id="bulk-purchase-unit"
              value={purchaseChoice}
              onValueChange={setPurchaseChoice}
              options={keepOptions}
            />
          </label>
          <label className="text-fg-muted grid gap-1 text-xs">
            Nova unidade de precificação
            <ThemedSelect
              id="bulk-pricing-unit"
              value={pricingChoice}
              onValueChange={setPricingChoice}
              options={keepOptions}
            />
          </label>
          <label className="text-fg-muted grid gap-1 text-xs">
            Nova unidade de comparação
            <ThemedSelect
              id="bulk-comparison-unit"
              value={comparisonChoice}
              onValueChange={setComparisonChoice}
              options={comparisonOptions}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-fg-muted text-xs">
            {selected.size === 0
              ? "Selecione os produtos abaixo."
              : `${selected.size} ${selected.size === 1 ? "produto selecionado" : "produtos selecionados"}.`}
          </span>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Limpar seleção
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={applyToSelected}
              disabled={applicationDisabled}
            >
              Aplicar aos selecionados
            </Button>
          </div>
        </div>
      </div>

      {appliedCount > 0 ? (
        <p role="status" className="text-success text-sm">
          Configuração aplicada a {appliedCount} produtos. Revise as linhas
          marcadas antes de salvar.
        </p>
      ) : null}

      <div className="border-border overflow-hidden rounded-lg border">
        <div className="border-border bg-surface-sunken flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={toggleVisible}>
              {allVisibleSelected ? "Desmarcar página" : "Selecionar página"}
            </Button>
            {filtered.length > visible.length ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelected(new Set(filtered.map((product) => product.id)))
                }
              >
                Selecionar os {filtered.length} resultados
              </Button>
            ) : null}
          </div>
          <span className="text-fg-muted text-xs tabular-nums">
            {filtered.length} encontrados · {changes.length} preparados
          </span>
        </div>
        <Table containerClassName="max-h-[min(25rem,45dvh)] overflow-y-auto">
          <TableHeader className="bg-surface sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-10">Sel.</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead>Configuração atual</TableHead>
              <TableHead>Após salvar</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-fg-muted py-10 text-center">
                  Nenhum produto encontrado com estes filtros.
                </TableCell>
              </TableRow>
            ) : null}
            {visible.map((product) => {
              const draft = drafts[product.id];
              const resulting = draft ?? originalConfiguration(product);
              const comparisonCode =
                product.comparisonUnitCode ?? product.pricingUnitCode;
              const resultingComparisonCode =
                resulting.comparisonUnitId === null
                  ? unitById.get(resulting.pricingUnitId)?.code ??
                    product.pricingUnitCode
                  : unitById.get(resulting.comparisonUnitId)?.code ?? "—";
              return (
                <TableRow
                  key={product.id}
                  data-state={selected.has(product.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      aria-label={`Selecionar ${product.name}`}
                      className="accent-primary size-4"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="block max-w-72 truncate" title={product.name}>
                      {product.name}
                    </span>
                    <span className="text-fg-muted block text-xs md:hidden">
                      {product.categoryName}
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted hidden md:table-cell">
                    {product.categoryName}
                  </TableCell>
                  <TableCell className="text-fg-muted font-mono text-xs">
                    {product.purchaseUnitCode} · {product.pricingUnitCode} · {comparisonCode}
                  </TableCell>
                  <TableCell
                    className={
                      draft
                        ? "text-primary font-mono text-xs font-semibold"
                        : "text-fg-subtle font-mono text-xs"
                    }
                  >
                    {unitById.get(resulting.purchaseUnitId)?.code ?? product.purchaseUnitCode} ·{" "}
                    {unitById.get(resulting.pricingUnitId)?.code ?? product.pricingUnitCode} ·{" "}
                    {resultingComparisonCode}
                  </TableCell>
                  <TableCell>
                    {draft ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => undo(product.id)}
                        title="Desfazer alteração"
                      >
                        <RotateCcw aria-hidden />
                        <span className="sr-only">
                          Desfazer alteração de {product.name}
                        </span>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="border-border bg-surface-sunken flex items-center justify-between border-t px-3 py-2">
          <span className="text-fg-muted text-xs tabular-nums">
            {filtered.length === 0
              ? "0 produtos"
              : `${(effectivePage - 1) * PAGE_SIZE + 1}–${Math.min(effectivePage * PAGE_SIZE, filtered.length)} de ${filtered.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={effectivePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span className="text-fg-muted min-w-16 text-center text-xs tabular-nums">
              {effectivePage} de {totalPages}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={effectivePage >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              aria-label="Próxima página"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      <ErrorLine error={state.error} />
      <SuccessLine
        message={
          state.savedAt
            ? `${state.updated ?? 0} ${state.updated === 1 ? "produto atualizado" : "produtos atualizados"}${state.skipped?.length ? `; ${state.skipped.length} ignorados porque passaram a possuir movimentação.` : "."}`
            : null
        }
      />
      {state.skipped?.length ? (
        <ul className="text-warning space-y-1 text-xs">
          {state.skipped.map((item) => (
            <li key={item.productId}>
              {item.productName ? `${item.productName}: ` : ""}
              {item.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  return (
    <form action={formAction} className={inModal ? "contents" : "space-y-4"}>
      <input type="hidden" name="changes" value={JSON.stringify(changes)} />
      {inModal ? <DialogBody>{content}</DialogBody> : content}
      {inModal ? (
        <DialogFooter className="justify-between">
          <span className="text-fg-muted text-xs">
            Nada é alterado até você salvar.
          </span>
          <SaveButton count={changes.length} />
        </DialogFooter>
      ) : (
        <div className="border-border bg-surface sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border px-3 py-3 shadow-sm">
          <span className="text-fg-muted text-xs">
            Nada é alterado até você salvar.
          </span>
          <SaveButton count={changes.length} />
        </div>
      )}
    </form>
  );
}
