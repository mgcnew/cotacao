"use client";

import { useActionState, useMemo, useState } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  postHistoricalNfe,
  type HistoricalNfeActionState,
} from "@/features/receipts/historical-actions";
import { normalizedNfeUnit } from "@/features/receipts/nfe";

type Supplier = {
  id: string;
  name: string;
  description: string;
  documentNumber: string | null;
};
type Product = {
  id: string;
  name: string;
  description: string;
  pricingUnitCode: string;
  pricingUnitSymbol: string;
  pricingUnitId: string;
  unitRules: {
    xmlUnit: string;
    targetUnitId: string;
    mode: string;
    factor: number | null;
  }[];
};
type Item = {
  id: string;
  description: string;
  supplier_code: string | null;
  commercial_unit: string | null;
  commercialQuantity: number;
  commercialUnitPrice: number;
  tributary_unit: string | null;
  tributaryQuantity: number;
  tributaryUnitPrice: number;
  netProductTotal: number;
  product_id: string | null;
  pricingQuantity: number | null;
  practicedPrice: number | null;
  reconciliation_status: string;
  match_method: string | null;
  notes: string | null;
};

type Draft = {
  productId: string;
  quantity: string;
  price: string;
  ignored: boolean;
};

const INITIAL_STATE: HistoricalNfeActionState = { error: null };
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function pricingFor(item: Item, product: Product) {
  const wanted = new Set(
    [product.pricingUnitCode, product.pricingUnitSymbol]
      .map(normalizedNfeUnit)
      .filter(Boolean),
  );
  let quantity: number | null = null;
  if (wanted.has(normalizedNfeUnit(item.commercial_unit))) {
    quantity = item.commercialQuantity;
  } else if (wanted.has(normalizedNfeUnit(item.tributary_unit))) {
    quantity = item.tributaryQuantity;
  } else {
    const rule = product.unitRules.find(
      (candidate) =>
        candidate.targetUnitId === product.pricingUnitId &&
        candidate.mode === "fixed_factor" &&
        candidate.factor &&
        [item.commercial_unit, item.tributary_unit]
          .map(normalizedNfeUnit)
          .includes(normalizedNfeUnit(candidate.xmlUnit)),
    );
    if (rule?.factor) {
      const sourceQuantity =
        normalizedNfeUnit(rule.xmlUnit) ===
        normalizedNfeUnit(item.commercial_unit)
          ? item.commercialQuantity
          : item.tributaryQuantity;
      quantity = sourceQuantity * rule.factor;
    }
  }
  return {
    quantity: quantity && quantity > 0 ? String(quantity) : "",
    price:
      quantity && quantity > 0 ? String(item.netProductTotal / quantity) : "",
  };
}

function initialDraft(item: Item, products: Product[]): Draft {
  const selected = products.find((product) => product.id === item.product_id);
  const suggested = selected ? pricingFor(item, selected) : null;
  return {
    productId: item.product_id ?? "",
    quantity: item.pricingQuantity?.toString() ?? suggested?.quantity ?? "",
    price: item.practicedPrice?.toString() ?? suggested?.price ?? "",
    ignored: item.reconciliation_status === "ignored",
  };
}

export function HistoricalNfeReconciliationForm({
  importId,
  issuerDocument,
  initialSupplierId,
  suppliers,
  products,
  items,
}: {
  importId: string;
  issuerDocument: string | null;
  initialSupplierId: string;
  suppliers: Supplier[];
  products: Product[];
  items: Item[];
}) {
  const action = useMemo(
    () => postHistoricalNfe.bind(null, importId),
    [importId],
  );
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      items.map((item) => [item.id, initialDraft(item, products)]),
    ),
  );
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const canAdoptDocument = Boolean(
    issuerDocument && selectedSupplier && !selectedSupplier.documentNumber,
  );

  function patchDraft(itemId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch },
    }));
  }

  function chooseProduct(item: Item, productId: string) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) {
      patchDraft(item.id, { productId: "", quantity: "", price: "" });
      return;
    }
    const pricing = pricingFor(item, product);
    patchDraft(item.id, {
      productId,
      quantity: pricing.quantity,
      price: pricing.price,
      ignored: false,
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <section className="border-border bg-surface rounded-xl border p-5">
        <label className="text-fg-muted flex flex-col gap-1.5 text-sm">
          Fornecedor da NF-e
          <SearchableSelect
            id="historical-nfe-supplier"
            name="supplierId"
            options={suppliers}
            value={supplierId}
            onValueChange={setSupplierId}
            placeholder="Digite o nome ou CNPJ…"
            emptyMessage="Nenhum fornecedor encontrado. Cadastre-o antes de concluir."
            required
          />
        </label>
        {canAdoptDocument ? (
          <label className="text-fg-muted mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="adoptSupplierDocument"
              className="mt-0.5 size-4"
            />
            Usar o CNPJ {issuerDocument} da NF-e para completar este fornecedor.
          </label>
        ) : null}
      </section>

      <div className="space-y-3">
        {items.map((item, index) => {
          const draft = drafts[item.id];
          const selectedProduct = products.find(
            (product) => product.id === draft.productId,
          );
          return (
            <article
              key={item.id}
              className="border-border bg-surface rounded-xl border p-4"
            >
              <input type="hidden" name="itemId" value={item.id} />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-fg font-medium">
                    {index + 1}. {item.description}
                  </p>
                  <p className="text-fg-muted mt-1 text-xs">
                    {NUMBER.format(item.commercialQuantity)}{" "}
                    {item.commercial_unit ?? ""} ×{" "}
                    {MONEY.format(item.commercialUnitPrice)}
                    {item.supplier_code
                      ? ` · código ${item.supplier_code}`
                      : ""}
                  </p>
                </div>
                {item.match_method ? (
                  <span className="bg-primary-soft text-primary rounded-full px-2 py-1 text-xs">
                    Sugestão encontrada
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_10rem]">
                <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                  Produto no sistema
                  <SearchableSelect
                    id={`historical-product-${item.id}`}
                    name={`product_${item.id}`}
                    options={products}
                    value={draft.productId}
                    onValueChange={(value) => chooseProduct(item, value)}
                    placeholder="Digite para associar…"
                  />
                </label>
                <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                  Quantidade{" "}
                  {selectedProduct?.pricingUnitSymbol ?? "na unidade de preço"}
                  <input
                    type="number"
                    step="any"
                    min="0.000001"
                    name={`quantity_${item.id}`}
                    value={draft.quantity}
                    onChange={(event) =>
                      patchDraft(item.id, { quantity: event.target.value })
                    }
                    disabled={draft.ignored}
                    className="border-input bg-background text-fg h-8 rounded-lg border px-2.5 text-sm"
                  />
                </label>
                <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                  Preço praticado
                  <input
                    type="number"
                    step="any"
                    min="0"
                    name={`price_${item.id}`}
                    value={draft.price}
                    onChange={(event) =>
                      patchDraft(item.id, { price: event.target.value })
                    }
                    disabled={draft.ignored}
                    className="border-input bg-background text-fg h-8 rounded-lg border px-2.5 text-sm"
                  />
                </label>
              </div>
              {!draft.ignored && draft.productId && !draft.quantity ? (
                <p className="text-warning mt-2 text-xs">
                  A unidade da nota não corresponde à unidade de preço do
                  produto. Informe a quantidade convertida.
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
                <label className="text-fg-muted flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name={`ignored_${item.id}`}
                    checked={draft.ignored}
                    onChange={(event) =>
                      patchDraft(item.id, { ignored: event.target.checked })
                    }
                    className="size-4"
                  />
                  Ignorar este item
                </label>
                <input
                  name={`notes_${item.id}`}
                  defaultValue={item.notes ?? ""}
                  placeholder={
                    draft.ignored
                      ? "Justificativa obrigatória"
                      : "Observação opcional"
                  }
                  className="border-input bg-background text-fg h-8 rounded-lg border px-2.5 text-sm"
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="border-border bg-surface sticky bottom-3 rounded-xl border p-4 shadow-lg">
        <ErrorLine error={state.error} />
        <div className="mt-3 flex justify-end">
          <FormSubmitButton pendingLabel="Gravando histórico…">
            Confirmar importação
          </FormSubmitButton>
        </div>
      </div>
    </form>
  );
}
