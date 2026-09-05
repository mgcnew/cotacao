"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChevronDown } from "lucide-react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
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
  /**
   * Observação e "guardar conversão" moram no estado, e não em `defaultValue`
   * / `defaultChecked`, por causa do React 19: ao enviar um formulário com
   * `action`, ele chama `requestFormReset` ANTES de rodar a action, então todo
   * campo não controlado volta ao padrão — inclusive quando a action recusa o
   * envio. Era isso que apagava a justificativa dos itens ignorados a cada
   * erro em outro item, deixando "ignorar" impossível de concluir.
   */
  notes: string;
  saveConversion: boolean;
  /** A conversão fica recolhida quando já está resolvida. */
  conversionOpen: boolean;
  /** O item inteiro segue a mesma regra: resolvido vira uma linha. */
  open: boolean;
  conversion: {
    sourceUnit: string;
    mode: "fixed_factor" | "manual_quantity";
    factor: string;
    learned: boolean;
  } | null;
};

/** `problemIds` é do guarda no cliente; a action do servidor só devolve erro. */
type FormState = HistoricalNfeActionState & { problemIds?: string[] };

const INITIAL_STATE: FormState = { error: null };
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

function parsedDecimal(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : null;
}

/** A conversão já tem resposta? É o que decide se ela pode ficar recolhida. */
function conversionSettled(draft: Draft) {
  if (!draft.conversion) return true;
  if (draft.conversion.mode === "manual_quantity") {
    const quantity = parsedDecimal(draft.quantity);
    return quantity !== null && quantity > 0;
  }
  const factor = parsedDecimal(draft.conversion.factor);
  return factor !== null && factor > 0;
}

/**
 * As mesmas regras da action, verificadas antes do envio.
 *
 * Não é para poupar a ida ao servidor: é para dizer QUAL item está faltando.
 * A action só pode responder "confira todos os itens", e numa nota de vinte
 * linhas — ainda mais no celular — isso não é achável.
 */
function itemProblem(draft: Draft): string | null {
  if (draft.ignored) {
    return draft.notes.trim()
      ? null
      : "Explique por que este item fica fora do histórico.";
  }
  if (!draft.productId) return "Associe um produto do catálogo.";
  const quantity = parsedDecimal(draft.quantity);
  if (quantity === null || quantity <= 0) {
    return "Informe a quantidade na unidade de preço.";
  }
  const price = parsedDecimal(draft.price);
  if (price === null || price < 0) return "Informe o preço praticado.";
  if (
    draft.saveConversion &&
    draft.conversion &&
    draft.conversion.mode === "fixed_factor"
  ) {
    const factor = parsedDecimal(draft.conversion.factor);
    if (factor === null || factor <= 0) {
      return `Informe quanto vale 1 ${draft.conversion.sourceUnit} para guardar a conversão.`;
    }
  }
  return null;
}

function initialDraft(
  item: Item,
  products: Product[],
  supplierId: string,
): Draft {
  const selected = products.find((product) => product.id === item.product_id);
  const suggested = selected ? pricingFor(item, selected, supplierId) : null;
  const draft: Draft = {
    productId: item.product_id ?? "",
    quantity: item.pricingQuantity?.toString() ?? suggested?.quantity ?? "",
    price: item.practicedPrice?.toString() ?? suggested?.price ?? "",
    ignored: item.reconciliation_status === "ignored",
    notes: item.notes ?? "",
    saveConversion: true,
    conversionOpen: false,
    open: true,
    conversion: suggested?.conversion ?? null,
  };
  // Nascem abertos só quando falta responder algo. A conversão já aprendida,
  // ou já deduzida da nota, e o item que a NF-e associou sozinha viram uma
  // linha de resumo — numa nota de vinte itens, o que chega pronto não pode
  // custar a mesma rolagem do que ainda precisa de você.
  return {
    ...draft,
    conversionOpen: !conversionSettled(draft),
    open: itemProblem(draft) !== null,
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
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [adoptDocument, setAdoptDocument] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "ignored">("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        initialDraft(item, products, initialSupplierId),
      ]),
    ),
  );
  // A action é recriada a cada envio, mas roda com o fecho de um render
  // qualquer; o espelho garante que ela veja os rascunhos de agora.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const guardedAction = useCallback(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      const pending = items.filter((item) =>
        itemProblem(draftsRef.current[item.id]),
      );
      if (pending.length) {
        const positions = pending.map(
          (item) => items.findIndex((candidate) => candidate.id === item.id) + 1,
        );
        const flagged = pending.map((item) => item.id);
        // A recusa deixa na tela exatamente o que falta, e aberto. Aqui e não
        // num efeito: o lugar de reagir a um envio é o próprio envio.
        setFilter("pending");
        setDrafts((current) => {
          const next = { ...current };
          for (const id of flagged) next[id] = { ...next[id], open: true };
          return next;
        });
        return {
          error:
            pending.length === 1
              ? `Falta resolver o item ${positions[0]}.`
              : `Faltam ${pending.length} itens: ${positions.join(", ")}.`,
          problemIds: flagged,
        };
      }
      // No sucesso a action redireciona: a promessa pode resolver sem estado
      // enquanto a navegação acontece, e o render seguinte não pode quebrar
      // por causa disso.
      const posted: FormState | undefined = await postHistoricalNfe(
        importId,
        previous,
        formData,
      );
      return posted ?? { error: null };
    },
    [importId, items],
  );
  const [state, formAction] = useActionState(guardedAction, INITIAL_STATE);

  // Apontar o erro não basta se ele está a dez telas de distância. O quadro
  // já foi ajustado no envio; falta levar a página até o primeiro item, o que
  // só dá para fazer depois que ele aparece.
  useEffect(() => {
    const first = state.problemIds?.[0];
    if (!first) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`item-${first}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

  const problems = useMemo(
    () =>
      new Map(items.map((item) => [item.id, itemProblem(drafts[item.id])])),
    [drafts, items],
  );
  const pendingCount = items.filter((item) => problems.get(item.id)).length;
  const ignoredCount = items.filter((item) => drafts[item.id].ignored).length;
  const visibleCount = items.filter((item) =>
    filter === "pending"
      ? problems.get(item.id)
      : filter === "ignored"
        ? drafts[item.id].ignored
        : true,
  ).length;
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
    setDrafts((current) => {
      const next: Draft = {
        ...current[item.id],
        productId,
        quantity: pricing.quantity,
        price: pricing.price,
        ignored: false,
        conversion: pricing.conversion,
      };
      return {
        ...current,
        [item.id]: { ...next, conversionOpen: !conversionSettled(next) },
      };
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
          const next: Draft = {
            ...currentDraft,
            quantity: pricing.quantity,
            price: pricing.price,
            conversion: pricing.conversion,
          };
          return [
            item.id,
            { ...next, conversionOpen: !conversionSettled(next) },
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
          // Escolher "varia em cada nota" já é a resposta inteira; digitar um
          // fator ainda não é, então esse continua aberto até sair do campo.
          conversionOpen:
            mode === "fixed_factor" ||
            !(quantityFromXml && quantityFromXml > 0),
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

  /**
   * Sair do cartão com o item resolvido recolhe ele — mesma regra da
   * conversão. Nunca recolhe o que ainda tem pendência: sumir com o que falta
   * seria o oposto do que este formulário precisa fazer.
   */
  function collapseIfReady(itemId: string) {
    setDrafts((current) => {
      const draft = current[itemId];
      if (!draft.open || itemProblem(draft)) return current;
      return { ...current, [itemId]: { ...draft, open: false } };
    });
  }

  /** Sair do campo do fator com um número válido recolhe a conversão. */
  function settleConversion(itemId: string) {
    setDrafts((current) => {
      const draft = current[itemId];
      if (!draft.conversionOpen || !conversionSettled(draft)) return current;
      return { ...current, [itemId]: { ...draft, conversionOpen: false } };
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
        {/* O cadastro mora onde a falta aparece, não no cabeçalho da página:
            no celular, quatro botões no topo empurravam a nota para baixo da
            dobra antes de a pessoa ler qualquer coisa. */}
        <p className="text-fg-subtle mt-2 text-xs">
          Fornecedor ainda não cadastrado?{" "}
          <Link
            href="/fornecedores/novo"
            target="_blank"
            className="text-primary underline-offset-4 hover:underline"
          >
            Cadastrar em outra aba
          </Link>
          .
        </p>
        {issuerAlreadyLinked ? (
          <p className="bg-success-soft text-success mt-3 rounded-lg px-3 py-2 text-sm">
            Empresa emitente reconhecida pelo CNPJ {issuerDocument}.
          </p>
        ) : canAdoptDocument ? (
          <label className="text-fg-muted mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="adoptSupplierDocument"
              checked={adoptDocument}
              onChange={(event) => setAdoptDocument(event.target.checked)}
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

      {/* Fechar uma nota é caçar o que falta. O filtro é o atalho para isso —
          e some sozinho quando não há nada pendente nem ignorado. */}
      {pendingCount > 0 || ignoredCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: `Todos (${items.length})` },
              { key: "pending", label: `Pendentes (${pendingCount})` },
              { key: "ignored", label: `Ignorados (${ignoredCount})` },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === option.key
                  ? "bg-primary text-primary-fg"
                  : "bg-surface-muted text-fg-muted hover:text-fg"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* `gap` e não `space-y`: o item escondido pelo filtro continua no DOM, e
          margem de irmão deixaria a folga dele na tela. */}
      <div className="flex flex-col gap-3">
        {visibleCount === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            {filter === "pending"
              ? "Nada pendente: todos os itens já têm produto, quantidade e preço."
              : "Nenhum item ignorado nesta nota."}
          </p>
        ) : null}
        {items.map((item, index) => {
          const draft = drafts[item.id];
          const selectedProduct = products.find(
            (product) => product.id === draft.productId,
          );
          const problem = problems.get(item.id) ?? null;
          // Sinalizado só depois de uma tentativa de envio: apontar o que
          // ainda nem foi preenchido transformaria a nota inteira num muro
          // vermelho antes de a pessoa começar.
          const flagged = state.problemIds?.includes(item.id) ?? false;
          const status = draft.ignored
            ? { label: "Ignorado", tone: "bg-surface-muted text-fg-muted" }
            : problem
              ? { label: "Pendente", tone: "bg-warning-soft text-warning" }
              : { label: "Pronto", tone: "bg-success-soft text-success" };
          const hiddenByFilter =
            filter === "pending"
              ? !problem
              : filter === "ignored"
                ? !draft.ignored
                : false;
          const summary = draft.ignored
            ? draft.notes.trim() || "Sem justificativa"
            : problem
              ? problem
              : `${selectedProduct?.name ?? ""} · ${NUMBER.format(
                  parsedDecimal(draft.quantity) ?? 0,
                )} ${selectedProduct?.pricingUnitSymbol ?? ""} · ${MONEY.format(
                  parsedDecimal(draft.price) ?? 0,
                )}`;
          return (
            <article
              key={item.id}
              id={`item-${item.id}`}
              /* Escondido pelo filtro, e não removido: campo fora do DOM não
                 entra no FormData — filtrar a lista apagaria do envio tudo o
                 que estivesse fora do recorte. */
              hidden={hiddenByFilter}
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) return;
                collapseIfReady(item.id);
              }}
              className={`bg-surface rounded-xl border p-3 sm:p-4 ${
                flagged
                  ? "border-destructive ring-destructive/20 ring-2"
                  : "border-border"
              }`}
            >
              <input type="hidden" name="itemId" value={item.id} />
              <button
                type="button"
                aria-expanded={draft.open}
                aria-controls={`item-body-${item.id}`}
                onClick={() => patchDraft(item.id, { open: !draft.open })}
                className="flex w-full items-start justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="text-fg font-medium">
                    <span className="text-fg-subtle">{index + 1}.</span>{" "}
                    {item.description}
                  </p>
                  <p className="text-fg-muted mt-1 truncate text-xs">
                    {draft.open ? (
                      <>
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
                        {item.match_method ? " · associação sugerida" : ""}
                      </>
                    ) : (
                      summary
                    )}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}
                  >
                    {status.label}
                  </span>
                  <ChevronDown
                    className={`text-fg-subtle size-4 transition-transform ${
                      draft.open ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </span>
              </button>

              {/* `hidden` outra vez, e pelo mesmo motivo do filtro: recolhido,
                  o item continua sendo enviado com o que já foi respondido. */}
              <div id={`item-body-${item.id}`} hidden={!draft.open}>
              {draft.ignored ? null : (
                <>
                  {/* Quantidade e preço são campos curtos: lado a lado no
                      celular eles cabem e a nota inteira continua visível na
                      rolagem. O seletor de produto é o único que precisa da
                      linha toda. */}
                  <div className="mt-4 grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_10rem]">
                    {/* `label` com `htmlFor`, e não envolvendo o campo: o
                        atalho de cadastro é um link, e dentro de um `label`
                        clicar nele também acionaria o campo. */}
                    <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <label
                          htmlFor={`historical-product-${item.id}`}
                          className="text-fg-muted"
                        >
                          Produto no sistema
                        </label>
                        {draft.productId ? null : (
                          <Link
                            href="/produtos/novo"
                            target="_blank"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Cadastrar produto
                          </Link>
                        )}
                      </span>
                      <SearchableSelect
                        id={`historical-product-${item.id}`}
                        name={`product_${item.id}`}
                        options={products}
                        value={draft.productId}
                        onValueChange={(value) => chooseProduct(item, value)}
                        placeholder="Digite para associar…"
                      />
                    </div>
                    <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
                      Quantidade{" "}
                      {selectedProduct?.pricingUnitSymbol ??
                        "na unidade de preço"}
                      <Input
                        type="number"
                        step="any"
                        min="0.000001"
                        name={`quantity_${item.id}`}
                        value={draft.quantity}
                        onChange={(event) =>
                          patchDraft(item.id, { quantity: event.target.value })
                        }
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
                      />
                    </label>
                  </div>

                  {selectedProduct && draft.conversion ? (
                    <div className="border-primary/25 bg-primary-soft mt-3 rounded-lg border p-3">
                      <input
                        type="hidden"
                        name={`conversion_unit_${item.id}`}
                        value={draft.conversion.sourceUnit}
                      />
                      {/* `hidden`, e não desmontar: recolhida, a conversão
                          continua no formulário e o que foi respondido segue
                          sendo enviado. */}
                      <div hidden={!draft.conversionOpen}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-fg text-sm font-medium">
                              Conversão para {selectedProduct.pricingUnitSymbol}
                            </p>
                            <p className="text-fg-muted mt-0.5 text-xs">
                              A NF-e informou {draft.conversion.sourceUnit};
                              defina como chegar à unidade usada no preço.
                            </p>
                          </div>
                          <span className="bg-surface text-primary rounded-full px-2 py-1 text-xs font-medium">
                            {draft.conversion.learned
                              ? "Conversão aprendida"
                              : "Revisar uma vez"}
                          </span>
                        </div>

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
                                {
                                  value: "fixed_factor",
                                  label: "Quantidade fixa",
                                },
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
                                  onBlur={() => settleConversion(item.id)}
                                  className="flex-1"
                                />
                                <span className="text-fg shrink-0 text-sm">
                                  {selectedProduct.pricingUnitSymbol}
                                </span>
                              </span>
                            </label>
                          ) : (
                            <div className="text-fg-muted self-end rounded-lg border border-dashed px-3 py-2 text-xs">
                              O total em {selectedProduct.pricingUnitSymbol}{" "}
                              será lido da NF-e quando existir; caso contrário,
                              informe a quantidade desta nota acima.
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
                            checked={draft.saveConversion}
                            onChange={(event) =>
                              patchDraft(item.id, {
                                saveConversion: event.target.checked,
                              })
                            }
                            className="mt-0.5 size-4"
                          />
                          {draft.conversion.learned
                            ? "Confirmar que esta regra continua válida para este fornecedor."
                            : "Guardar para as próximas notas deste fornecedor e produto."}
                        </label>
                      </div>

                      {draft.conversionOpen ? null : (
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="text-fg min-w-0 text-xs">
                            {draft.conversion.mode === "fixed_factor"
                              ? `1 ${draft.conversion.sourceUnit} = ${NUMBER.format(
                                  parsedDecimal(draft.conversion.factor) ?? 0,
                                )} ${selectedProduct.pricingUnitSymbol}`
                              : `Quantidade em ${selectedProduct.pricingUnitSymbol} lida de cada nota`}
                            <span className="text-fg-muted">
                              {draft.conversion.learned
                                ? " · aprendida"
                                : " · revisar uma vez"}
                              {draft.saveConversion ? " · será guardada" : ""}
                            </span>
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              patchDraft(item.id, { conversionOpen: true })
                            }
                          >
                            Alterar
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {draft.productId && !draft.quantity ? (
                    <p className="text-warning mt-2 text-xs">
                      A unidade da nota não corresponde à unidade de preço do
                      produto. Informe a quantidade convertida.
                    </p>
                  ) : null}
                </>
              )}

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
                  value={draft.notes}
                  onChange={(event) =>
                    patchDraft(item.id, { notes: event.target.value })
                  }
                  placeholder={
                    draft.ignored
                      ? "Por que fica fora do histórico"
                      : "Observação opcional"
                  }
                  aria-label={
                    draft.ignored
                      ? `Justificativa para ignorar o item ${index + 1}`
                      : `Observação do item ${index + 1}`
                  }
                />
              </div>

              {flagged && problem ? (
                <p role="alert" className="text-destructive mt-2 text-xs">
                  {problem}
                </p>
              ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {/* `first:mt-0`: sem erro, o ErrorLine não renderiza nada e esta linha
          passa a ser o primeiro filho — não sobra folga fantasma no topo. */}
      <div className="border-border bg-surface sticky bottom-3 rounded-xl border p-3 shadow-lg sm:p-4">
        <ErrorLine error={state.error} />
        <div className="mt-3 flex flex-col gap-2 first:mt-0 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-fg-muted text-xs" aria-live="polite">
            {items.length - pendingCount} de {items.length}{" "}
            {items.length === 1 ? "item pronto" : "itens prontos"}
            {pendingCount
              ? ` · ${pendingCount} ${pendingCount === 1 ? "pendente" : "pendentes"}`
              : ""}
          </p>
          <FormSubmitButton
            pendingLabel="Gravando histórico…"
            className="w-full sm:w-auto"
          >
            Confirmar importação
          </FormSubmitButton>
        </div>
      </div>
    </form>
  );
}
