"use client";

import { useActionState, useMemo, useState } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
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
    supplierId: string;
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
  conversion: {
    sourceUnit: string;
    mode: "fixed_factor" | "manual_quantity";
    factor: string;
    learned: boolean;
  } | null;
};

const INITIAL_STATE: HistoricalNfeActionState = { error: null };
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const VARIABLE_WEIGHT_UNITS = new Set(["KG", "KGM", "G", "GR"]);

function sourceQuantity(item: Item, unit: string) {
  const normalized = normalizedNfeUnit(unit);
  if (normalized === normalizedNfeUnit(item.commercial_unit)) {
    return item.commercialQuantity;
  }
  if (normalized === normalizedNfeUnit(item.tributary_unit)) {
    return item.tributaryQuantity;
  }
  return null;
}

function pricingFor(item: Item, product: Product, supplierId: string) {
  const wanted = new Set(
    [product.pricingUnitCode, product.pricingUnitSymbol]
      .map(normalizedNfeUnit)
      .filter(Boolean),
  );
  const applicableRules = product.unitRules.filter(
    (rule) => rule.supplierId === supplierId,
  );
  let quantity: number | null = null;
  if (wanted.has(normalizedNfeUnit(item.commercial_unit))) {
    quantity = item.commercialQuantity;
  } else if (wanted.has(normalizedNfeUnit(item.tributary_unit))) {
    quantity = item.tributaryQuantity;
    const sourceUnit = item.commercial_unit;
    if (
      sourceUnit &&
      item.commercialQuantity > 0 &&
      normalizedNfeUnit(sourceUnit) !== normalizedNfeUnit(item.tributary_unit)
    ) {
      const variable = VARIABLE_WEIGHT_UNITS.has(
        normalizedNfeUnit(product.pricingUnitCode || product.pricingUnitSymbol),
      );
      const inferredFactor = item.tributaryQuantity / item.commercialQuantity;
      const saved = applicableRules.find(
        (rule) =>
          rule.targetUnitId === product.pricingUnitId &&
          normalizedNfeUnit(rule.xmlUnit) === normalizedNfeUnit(sourceUnit),
      );
      const factorMatches =
        saved?.factor != null &&
        Math.abs(saved.factor - inferredFactor) <=
          Math.max(Math.abs(inferredFactor), 1) * 0.000001;
      return {
        quantity: quantity > 0 ? String(quantity) : "",
        price: quantity > 0 ? String(item.netProductTotal / quantity) : "",
        conversion: {
          sourceUnit,
          mode: variable
            ? ("manual_quantity" as const)
            : ("fixed_factor" as const),
          factor: variable ? "" : String(inferredFactor),
          learned: variable
            ? saved?.mode === "manual_quantity"
            : saved?.mode === "fixed_factor" && factorMatches,
        },
      };
    }
  } else {
    const rule = applicableRules.find(
      (candidate) =>
        candidate.targetUnitId === product.pricingUnitId &&
        [item.commercial_unit, item.tributary_unit]
          .map(normalizedNfeUnit)
          .includes(normalizedNfeUnit(candidate.xmlUnit)),
    );
    const currentSourceUnit = rule
      ? ([item.commercial_unit, item.tributary_unit].find(
          (unit) => normalizedNfeUnit(unit) === normalizedNfeUnit(rule.xmlUnit),
        ) ?? rule.xmlUnit)
      : null;
    if (rule?.mode === "fixed_factor" && rule.factor) {
      const source = sourceQuantity(item, currentSourceUnit ?? rule.xmlUnit);
      quantity = source === null ? null : source * rule.factor;
    }
    if (rule) {
      return {
        quantity: quantity && quantity > 0 ? String(quantity) : "",
        price:
          quantity && quantity > 0
            ? String(item.netProductTotal / quantity)
            : "",
        conversion: {
          sourceUnit: currentSourceUnit ?? rule.xmlUnit,
          mode: rule.mode as "fixed_factor" | "manual_quantity",
          factor: rule.factor === null ? "" : String(rule.factor),
          learned: true,
        },
      };
    }
  }
  return {
    quantity: quantity && quantity > 0 ? String(quantity) : "",
    price:
      quantity && quantity > 0 ? String(item.netProductTotal / quantity) : "",
    conversion:
      quantity === null
        ? {
            sourceUnit: item.commercial_unit ?? item.tributary_unit ?? "",
            mode: VARIABLE_WEIGHT_UNITS.has(
              normalizedNfeUnit(
                product.pricingUnitCode || product.pricingUnitSymbol,
              ),
            )
              ? ("manual_quantity" as const)
              : ("fixed_factor" as const),
            factor: "",
            learned: false,
          }
        : null,
  };
}

function initialDraft(
  item: Item,
  products: Product[],
  supplierId: string,
): Draft {
  const selected = products.find((product) => product.id === item.product_id);
  const suggested = selected ? pricingFor(item, selected, supplierId) : null;
  return {
    productId: item.product_id ?? "",
    quantity: item.pricingQuantity?.toString() ?? suggested?.quantity ?? "",
    price: item.practicedPrice?.toString() ?? suggested?.price ?? "",
    ignored: item.reconciliation_status === "ignored",
    conversion: suggested?.conversion ?? null,
  };
}

export function HistoricalNfeReconciliationForm({
  importId,
  issuerDocument,
  initialIssuerLinked,
  initialSupplierId,
  suppliers,
  products,
  items,
}: {
  importId: string;
  issuerDocument: string | null;
  initialIssuerLinked: boolean;
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
      items.map((item) => [
        item.id,
        initialDraft(item, products, initialSupplierId),
      ]),
    ),
  );
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const canAdoptDocument = Boolean(
    issuerDocument && selectedSupplier && !selectedSupplier.documentNumber,
  );
  const issuerAlreadyLinked = Boolean(
    initialIssuerLinked && supplierId === initialSupplierId,
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
      patchDraft(item.id, {
        productId: "",
        quantity: "",
        price: "",
        conversion: null,
      });
      return;
    }
    const pricing = pricingFor(item, product, supplierId);
    patchDraft(item.id, {
      productId,
      quantity: pricing.quantity,
      price: pricing.price,
      ignored: false,
      conversion: pricing.conversion,
    });
  }

  function changeSupplier(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    setDrafts((current) =>
      Object.fromEntries(
        items.map((item) => {
          const currentDraft = current[item.id];
          const product = products.find(
            (candidate) => candidate.id === currentDraft.productId,
          );
          if (!product) return [item.id, currentDraft];
          const pricing = pricingFor(item, product, nextSupplierId);
          return [
            item.id,
            {
              ...currentDraft,
              quantity: pricing.quantity,
              price: pricing.price,
              conversion: pricing.conversion,
            },
          ];
        }),
      ),
    );
  }

  function changeConversion(
    item: Item,
    mode: "fixed_factor" | "manual_quantity",
    factor: string,
  ) {
    setDrafts((current) => {
      const draft = current[item.id];
      if (!draft.conversion) return current;
      const parsedFactor = Number(factor.replace(",", "."));
      const source = sourceQuantity(item, draft.conversion.sourceUnit);
      const product = products.find(
        (candidate) => candidate.id === draft.productId,
      );
      const wanted = new Set(
        [product?.pricingUnitCode, product?.pricingUnitSymbol]
          .map(normalizedNfeUnit)
          .filter(Boolean),
      );
      const quantityFromXml = wanted.has(
        normalizedNfeUnit(item.commercial_unit),
      )
        ? item.commercialQuantity
        : wanted.has(normalizedNfeUnit(item.tributary_unit))
          ? item.tributaryQuantity
          : null;
      const converted =
        mode === "fixed_factor" &&
        Number.isFinite(parsedFactor) &&
        parsedFactor > 0 &&
        source !== null
          ? source * parsedFactor
          : null;
      return {
        ...current,
        [item.id]: {
          ...draft,
          quantity:
            mode === "manual_quantity"
              ? quantityFromXml && quantityFromXml > 0
                ? String(quantityFromXml)
                : ""
              : converted === null
                ? ""
                : String(converted),
          price:
            mode === "manual_quantity"
              ? quantityFromXml && quantityFromXml > 0
                ? String(item.netProductTotal / quantityFromXml)
                : ""
              : converted === null
                ? ""
                : String(item.netProductTotal / converted),
          conversion: {
            ...draft.conversion,
            mode,
            factor: mode === "fixed_factor" ? factor : "",
            learned: false,
          },
        },
      };
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <section className="border-border bg-surface rounded-xl border p-4 sm:p-5">
        <label className="text-fg-muted flex flex-col gap-1.5 text-sm">
          Fornecedor da NF-e
          <SearchableSelect
            id="historical-nfe-supplier"
            name="supplierId"
            options={suppliers}
            value={supplierId}
            onValueChange={changeSupplier}
            placeholder="Digite o nome ou CNPJ…"
            emptyMessage="Nenhum fornecedor encontrado. Cadastre-o antes de concluir."
            required
          />
        </label>
        {issuerAlreadyLinked ? (
          <p className="bg-success-soft text-success mt-3 rounded-lg px-3 py-2 text-sm">
            Empresa emitente reconhecida pelo CNPJ {issuerDocument}.
          </p>
        ) : canAdoptDocument ? (
          <label className="text-fg-muted mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="adoptSupplierDocument"
              className="mt-0.5 size-4"
            />
            Vincular o CNPJ {issuerDocument} e defini-lo como empresa principal
            deste fornecedor.
          </label>
        ) : issuerDocument && selectedSupplier ? (
          <p className="bg-primary-soft text-primary mt-3 rounded-lg px-3 py-2 text-sm">
            Ao confirmar, o CNPJ {issuerDocument} ficará salvo como outra
            empresa emitente deste fornecedor. Nas próximas notas o vínculo será
            automático.
          </p>
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
              className="border-border bg-surface rounded-xl border p-3 sm:p-4"
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
                    {normalizedNfeUnit(item.tributary_unit) !==
                      normalizedNfeUnit(item.commercial_unit) ||
                    item.tributaryQuantity !== item.commercialQuantity
                      ? ` · tributável: ${NUMBER.format(item.tributaryQuantity)} ${item.tributary_unit ?? ""}`
                      : ""}
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

              {/* Quantidade e preço são campos curtos: lado a lado no celular
                  eles cabem e a nota inteira continua visível na rolagem. O
                  seletor de produto é o único que precisa da linha toda. */}
              <div className="mt-4 grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_10rem]">
                <label className="text-fg-muted col-span-2 flex flex-col gap-1.5 text-xs lg:col-span-1">
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
                  <Input
                    type="number"
                    step="any"
                    min="0.000001"
                    name={`quantity_${item.id}`}
                    value={draft.quantity}
                    onChange={(event) =>
                      patchDraft(item.id, { quantity: event.target.value })
                    }
                    disabled={draft.ignored}
                  />
                </label>
                <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                  Preço praticado
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    name={`price_${item.id}`}
                    value={draft.price}
                    onChange={(event) =>
                      patchDraft(item.id, { price: event.target.value })
                    }
                    disabled={draft.ignored}
                  />
                </label>
              </div>
              {!draft.ignored && selectedProduct && draft.conversion ? (
                <div className="border-primary/25 bg-primary-soft mt-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-fg text-sm font-medium">
                        Conversão para {selectedProduct.pricingUnitSymbol}
                      </p>
                      <p className="text-fg-muted mt-0.5 text-xs">
                        A NF-e informou {draft.conversion.sourceUnit}; defina
                        como chegar à unidade usada no preço.
                      </p>
                    </div>
                    <span className="bg-surface text-primary rounded-full px-2 py-1 text-xs font-medium">
                      {draft.conversion.learned
                        ? "Conversão aprendida"
                        : "Revisar uma vez"}
                    </span>
                  </div>

                  <input
                    type="hidden"
                    name={`conversion_unit_${item.id}`}
                    value={draft.conversion.sourceUnit}
                  />
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                    <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                      Tipo de conversão
                      <ThemedSelect
                        id={`conversion-mode-${item.id}`}
                        name={`conversion_mode_${item.id}`}
                        value={draft.conversion.mode}
                        onValueChange={(value) =>
                          changeConversion(
                            item,
                            value as "fixed_factor" | "manual_quantity",
                            draft.conversion?.factor ?? "",
                          )
                        }
                        options={[
                          { value: "fixed_factor", label: "Quantidade fixa" },
                          {
                            value: "manual_quantity",
                            label: "Varia em cada nota",
                          },
                        ]}
                      />
                    </label>

                    {draft.conversion.mode === "fixed_factor" ? (
                      <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                        Quantidade por {draft.conversion.sourceUnit}
                        <span className="flex items-center gap-2">
                          <span className="text-fg shrink-0 text-sm">
                            1 {draft.conversion.sourceUnit} =
                          </span>
                          <Input
                            type="number"
                            step="any"
                            min="0.000001"
                            name={`conversion_factor_${item.id}`}
                            value={draft.conversion.factor}
                            onChange={(event) =>
                              changeConversion(
                                item,
                                "fixed_factor",
                                event.target.value,
                              )
                            }
                            className="flex-1"
                          />
                          <span className="text-fg shrink-0 text-sm">
                            {selectedProduct.pricingUnitSymbol}
                          </span>
                        </span>
                      </label>
                    ) : (
                      <div className="text-fg-muted self-end rounded-lg border border-dashed px-3 py-2 text-xs">
                        O total em {selectedProduct.pricingUnitSymbol} será lido
                        da NF-e quando existir; caso contrário, informe a
                        quantidade desta nota acima.
                        <input
                          type="hidden"
                          name={`conversion_factor_${item.id}`}
                          value=""
                        />
                      </div>
                    )}
                  </div>

                  <label className="text-fg-muted mt-3 flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      name={`save_conversion_${item.id}`}
                      defaultChecked
                      className="mt-0.5 size-4"
                    />
                    {draft.conversion.learned
                      ? "Confirmar que esta regra continua válida para este fornecedor."
                      : "Guardar para as próximas notas deste fornecedor e produto."}
                  </label>
                </div>
              ) : null}
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
                <Input
                  name={`notes_${item.id}`}
                  defaultValue={item.notes ?? ""}
                  placeholder={
                    draft.ignored
                      ? "Justificativa obrigatória"
                      : "Observação opcional"
                  }
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
