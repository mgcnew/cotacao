"use client";

import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageX,
} from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { unitWord } from "@/features/products/units";
import {
  submitQuotation,
  type SubmitQuotationState,
} from "@/features/quotations/actions";
import type { PublicQuotationItem } from "@/features/quotations/public";
import { formatUnitPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Nove dígitos chegam a 9.999.999,99 — muito além de qualquer preço unitário. */
const MAX_DIGITOS = 9;

/**
 * Preço digitado como sequência de números, sem vírgula.
 *
 * Os dois últimos dígitos são sempre os centavos, então "7" vira 0,07, "70"
 * vira 0,70 e "700" vira 7,00. É como todo aplicativo de banco se comporta, e
 * resolve o erro que aparecia aqui: quem digitava "7" e enviava mandava sete
 * reais achando que tinha mandado sete — ou parava para descobrir onde ficava
 * a vírgula no teclado do celular.
 *
 * Apagar funciona sozinho: o valor volta a ser só os dígitos que sobraram.
 */
function formatarCentavos(entrada: string): string {
  const digitos = entrada
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, MAX_DIGITOS);
  if (!digitos) return "";

  const preenchido = digitos.padStart(3, "0");
  const inteiro = Number(preenchido.slice(0, -2)).toLocaleString("pt-BR");
  return `${inteiro},${preenchido.slice(-2)}`;
}

/**
 * As três respostas possíveis, lado a lado em qualquer largura.
 *
 * O rótulo é curto de propósito: o celular mostra três colunas de ~110px, e a
 * explicação completa de cada uma vive uma vez só, no cabeçalho da página e no
 * `title`/`aria-label` do botão — não repetida em cada item.
 *
 * Selecionado = cor sólida + ícone de confirmação + texto; nunca só a cor.
 * `text-surface` sobre o fundo sólido acompanha o tema: branco no claro e
 * escuro no escuro, onde os tokens de estado ficam claros.
 */
const RESPONSE_OPTIONS = [
  {
    value: "priced",
    label: "Tenho",
    full: "Tenho disponível e vou informar o preço",
    icon: PackageCheck,
    idleIcon: "text-success",
    activeClass: "border-success bg-success text-surface",
  },
  {
    value: "unavailable",
    label: "Sem estoque agora",
    full: "Trabalho com o produto, mas não consigo atender desta vez",
    icon: Clock3,
    idleIcon: "text-warning",
    activeClass: "border-warning bg-warning text-surface",
  },
  {
    value: "does_not_supply",
    label: "Não trabalho",
    full: "Não trabalho com este produto",
    icon: PackageX,
    idleIcon: "text-destructive",
    activeClass: "border-destructive bg-destructive text-surface",
  },
] as const;

type ResponseStatus = "" | (typeof RESPONSE_OPTIONS)[number]["value"];

type HistoricalPresentation = {
  itemId: string;
  attributeDefinitionId: string;
  productName: string;
  value: number;
  unit: string | null;
};

type SuspiciousPrice = {
  itemId: string;
  productName: string;
  enteredPrice: number;
  historicalPrice: number;
  historicalAt: string | null;
};

/** Ordem pedida pelo grupo: aplica a quem ainda não respondeu, ou desfaz. */
type BulkSignal = { nonce: number; value: ResponseStatus; undo: boolean };

type Draft = {
  status: ResponseStatus;
  price: string;
  attributes: Record<string, string>;
  obs: string;
};

const draftKey = (token: string, id: string) => `cotacao:${token}:${id}`;

const initialDraftCache = new Map<string, string>();

/**
 * Rascunhos deste link, lidos uma única vez por carregamento da página.
 *
 * Vai por `useSyncExternalStore` para o servidor renderizar vazio e o cliente
 * restaurar depois, sem descompasso de hidratação e sem `setState` em efeito. O
 * valor fica em cache: o que o fornecedor digita depois não reabre o rascunho.
 */
function readInitialDrafts(token: string, ids: string[]): string {
  const cached = initialDraftCache.get(token);
  if (cached !== undefined) return cached;
  const found: Record<string, string> = {};
  try {
    for (const id of ids) {
      const raw = window.localStorage.getItem(draftKey(token, id));
      if (raw) found[id] = raw;
    }
  } catch {
    // armazenamento bloqueado: sem rascunho
  }
  const json = JSON.stringify(found);
  initialDraftCache.set(token, json);
  return json;
}

const subscribeNone = () => () => {};

function parseDraft(raw: string | undefined): Draft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<Draft>;
    const status =
      draft.status === "priced" ||
      draft.status === "unavailable" ||
      draft.status === "does_not_supply"
        ? draft.status
        : "";
    return {
      status,
      price: typeof draft.price === "string" ? draft.price : "",
      obs: typeof draft.obs === "string" ? draft.obs : "",
      attributes:
        draft.attributes && typeof draft.attributes === "object"
          ? (draft.attributes as Record<string, string>)
          : {},
    };
  } catch {
    return null;
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Leva o fornecedor ao próximo item, sem deixar a tela parada onde estava. */
function scrollToNextCard(currentId: string) {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>('article[id^="cotacao-item-"]'),
  );
  const index = cards.findIndex((c) => c.id === `cotacao-item-${currentId}`);
  const next = cards[index + 1];
  if (!next) return;
  next.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

function ItemCard({
  token,
  item,
  flagged,
  bulk,
  initialDraft,
  onResolvedChange,
  onHistoricalPresentationChange,
  onSuspiciousPriceChange,
}: {
  token: string;
  item: PublicQuotationItem;
  flagged: boolean;
  bulk?: BulkSignal;
  initialDraft: Draft | null;
  onResolvedChange: (id: string, resolved: boolean) => void;
  onHistoricalPresentationChange: (
    id: string,
    presentation: HistoricalPresentation | null,
  ) => void;
  onSuspiciousPriceChange: (
    id: string,
    suspicious: SuspiciousPrice | null,
  ) => void;
}) {
  const id = item.supplier_quotation_item_id;
  const [status, setStatus] = React.useState<ResponseStatus>(
    initialDraft?.status ?? "",
  );
  const [price, setPrice] = React.useState(initialDraft?.price ?? "");
  const [obs, setObs] = React.useState(initialDraft?.obs ?? "");
  const [obsOpen, setObsOpen] = React.useState(Boolean(initialDraft?.obs));
  const [commaTyped, setCommaTyped] = React.useState(false);
  const [attributeValues, setAttributeValues] = React.useState<Record<string, string>>(
    () => ({
      ...Object.fromEntries(
        item.attributes.map((attribute) => [
          attribute.attribute_definition_id,
          attribute.is_conversion_factor &&
          attribute.suggested_value_numeric !== null
            ? String(attribute.suggested_value_numeric).replace(".", ",")
            : "",
        ]),
      ),
      ...(initialDraft?.attributes ?? {}),
    }),
  );
  const priced = status === "priced";
  const numericPrice = Number(price.replace(/\./g, "").replace(",", "."));
  const validPrice =
    price.trim().length > 0 && Number.isFinite(numericPrice) && numericPrice > 0;
  const missingRequiredAttribute = item.attributes.find(
    (attribute) =>
      attribute.required &&
      !attributeValues[attribute.attribute_definition_id]?.trim(),
  );
  const invalidConversionAttribute = item.attributes.find((attribute) => {
    if (!attribute.is_conversion_factor) return false;
    const raw = attributeValues[attribute.attribute_definition_id]?.trim();
    if (!raw) return attribute.required;
    const numeric = Number(raw.replace(/\./g, "").replace(",", "."));
    return !Number.isFinite(numeric) || numeric <= 0;
  });
  const resolved =
    (status !== "" && !priced) ||
    (validPrice && !missingRequiredAttribute && !invalidConversionAttribute);
  const validationMessage =
    status === ""
      ? "Toque em uma das três opções."
      : priced && !validPrice
      ? price.trim()
        ? "Informe um preço válido e maior que zero."
        : "Informe o preço, ou toque em outra opção."
      : priced && missingRequiredAttribute
        ? `Informe ${missingRequiredAttribute.name.toLocaleLowerCase("pt-BR")}.`
        : priced && invalidConversionAttribute
          ? `${invalidConversionAttribute.name} deve ser maior que zero.`
          : null;
  const conversionAttribute = item.attributes.find(
    (attribute) => attribute.is_conversion_factor,
  );
  // TUDO o que é exigido tem que aparecer — inclusive um segundo fator de
  // conversão. Antes só ficava de fora o `conversionAttribute` (o primeiro), mas
  // o filtro aqui era `!is_conversion_factor`: um segundo fator, obrigatório,
  // sumia da tela e continuava valendo em `missingRequiredAttribute`. O item
  // nunca virava "respondido", a barra não andava e o envio ficava travado por
  // um campo que o fornecedor não via.
  //
  // O link só entrega dois fatores quando o banco está sem a desambiguação
  // produto-contra-categoria (migration 0111). Com ela aplicada isto não
  // acontece; sem ela, o fornecedor ao menos consegue terminar.
  const otherAttributes = item.attributes.filter(
    (attribute) => attribute !== conversionAttribute,
  );
  // Preço e conteúdo só viram um campo só quando o item é embalagem. `purpose`
  // chega a partir da migration 0110; antes dela o fator de conversão é o
  // único sinal disponível — e na prática ele sempre foi de embalagem.
  const packaging =
    Boolean(conversionAttribute) &&
    (item.purpose === undefined || item.purpose === "packaging");
  const rawFactor = conversionAttribute
    ? attributeValues[conversionAttribute.attribute_definition_id] ?? ""
    : "";
  const numericFactor = Number(rawFactor.replace(/\./g, "").replace(",", "."));
  const normalizedPrice =
    validPrice && Number.isFinite(numericFactor) && numericFactor > 0
      ? numericPrice / numericFactor
      : null;
  const historicalPrice =
    item.last_supplier_price === null
      ? null
      : Number(item.last_supplier_price);
  const priceRatio =
    validPrice && historicalPrice !== null && historicalPrice > 0
      ? numericPrice / historicalPrice
      : null;
  const suspiciousPrice =
    priceRatio !== null &&
    Math.abs(numericPrice - (historicalPrice ?? 0)) >= 2 &&
    (priceRatio >= 3 || priceRatio <= 1 / 3);
  // Sem histórico não há como comparar; um preço abaixo de dez centavos quase
  // sempre é a vírgula digitada onde não devia ("4,5" vira 0,45).
  const veryLowPrice = validPrice && numericPrice < 0.1 && !suspiciousPrice;

  const dirtyRef = React.useRef(false);
  const [bulkApplied, setBulkApplied] = React.useState(false);
  const [seenBulkNonce, setSeenBulkNonce] = React.useState(0);

  // Ordem do grupo ("Não trabalho com os que faltam") e seu desfazer, aplicada
  // na própria renderização: é estado derivado de uma prop, não de um efeito.
  if (bulk && bulk.nonce !== seenBulkNonce) {
    setSeenBulkNonce(bulk.nonce);
    if (bulk.undo) {
      if (bulkApplied) {
        setBulkApplied(false);
        setStatus("");
        setPrice("");
      }
    } else if (status === "") {
      setBulkApplied(true);
      setStatus(bulk.value);
    }
  }

  function escolherStatus(proximo: ResponseStatus) {
    dirtyRef.current = true;
    setStatus(proximo);
    setBulkApplied(false);
    if (proximo === "priced") {
      // O campo de preço nasce depois deste clique; leva-o para o meio da tela
      // antes de focar, senão o teclado e a barra fixa o cobrem.
      window.setTimeout(() => {
        const field = document.getElementById(`preco_${id}`);
        field?.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
        field?.focus({ preventScroll: true });
      }, 60);
    } else {
      setPrice("");
      setCommaTyped(false);
      // Resposta sem preço encerra o item: segue para o próximo.
      window.setTimeout(() => scrollToNextCard(id), 280);
    }
  }

  // Rascunho: o WhatsApp costuma matar o navegador interno e levar tudo junto.
  // Só grava depois de uma ação do fornecedor, para o primeiro render (ainda
  // vazio) nunca apagar o que está guardado.
  React.useEffect(() => {
    if (seenBulkNonce > 0) dirtyRef.current = true;
  }, [seenBulkNonce]);

  React.useEffect(() => {
    if (!dirtyRef.current) return;
    try {
      if (status === "" && !price && !obs) {
        window.localStorage.removeItem(draftKey(token, id));
        return;
      }
      const draft: Draft = { status, price, attributes: attributeValues, obs };
      window.localStorage.setItem(draftKey(token, id), JSON.stringify(draft));
    } catch {
      // sem armazenamento, sem rascunho
    }
  }, [token, id, status, price, obs, attributeValues]);

  React.useEffect(() => {
    onResolvedChange(id, resolved);
  }, [id, onResolvedChange, resolved]);

  React.useEffect(() => {
    onSuspiciousPriceChange(
      id,
      suspiciousPrice && historicalPrice !== null
        ? {
            itemId: id,
            productName: item.product_name,
            enteredPrice: numericPrice,
            historicalPrice,
            historicalAt: item.last_supplier_price_at,
          }
        : null,
    );
  }, [
    historicalPrice,
    id,
    item.last_supplier_price_at,
    item.product_name,
    numericPrice,
    onSuspiciousPriceChange,
    suspiciousPrice,
  ]);

  const suggestedFactor = conversionAttribute?.suggested_value_numeric ?? null;
  const reusesHistoricalPresentation =
    priced &&
    suggestedFactor !== null &&
    Number.isFinite(numericFactor) &&
    numericFactor === Number(suggestedFactor);

  React.useEffect(() => {
    onHistoricalPresentationChange(
      id,
      reusesHistoricalPresentation && conversionAttribute
        ? {
            itemId: id,
            attributeDefinitionId:
              conversionAttribute.attribute_definition_id,
            productName: item.product_name,
            value: numericFactor,
            unit: conversionAttribute.unit?.symbol ?? null,
          }
        : null,
    );
  }, [
    conversionAttribute,
    id,
    item.product_name,
    numericFactor,
    onHistoricalPresentationChange,
    reusesHistoricalPresentation,
  ]);

  const needsAttention = flagged && !resolved;

  return (
    <article
      id={`cotacao-item-${id}`}
      className={cn(
        "border-border bg-surface scroll-mt-4 rounded-xl border transition-colors",
        resolved && "border-success/45",
        needsAttention && "border-warning",
      )}
    >
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name={`nome_${id}`} value={item.product_name} />
      {/* O status viaja escondido; a escolha é deliberadamente explícita. */}
      <input type="hidden" name={`status_${id}`} value={status} />

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fg text-base leading-snug font-semibold wrap-anywhere">
              {item.product_name}
            </p>
            <p className="text-fg-muted mt-0.5 text-sm">
              Quantidade:{" "}
              <strong className="text-fg tabular-nums">
                {QTY.format(Number(item.requested_quantity))}{" "}
                {item.purchase_unit.symbol}
              </strong>
            </p>
            {item.notes ? (
              <p className="text-fg-muted mt-1 text-sm">{item.notes}</p>
            ) : null}
          </div>
          {resolved ? (
            <span className="text-success flex shrink-0 items-center gap-1 text-sm font-medium">
              <CheckCircle2 className="size-5" aria-hidden />
              <span className="sr-only sm:not-sr-only">Respondido</span>
            </span>
          ) : needsAttention ? (
            <span className="bg-warning-soft text-warning flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium">
              <AlertCircle className="size-4" aria-hidden />
              Falta responder
            </span>
          ) : null}
        </div>

        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">
            Disponibilidade de {item.product_name}
          </legend>
          {RESPONSE_OPTIONS.map((option) => {
            const active = status === option.value;
            const OptionIcon = option.icon;
            return (
              <label
                key={option.value}
                title={option.full}
                className={cn(
                  "border-border bg-surface hover:border-fg-subtle has-focus-visible:ring-ring/50 relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-sm leading-tight font-semibold transition-colors has-focus-visible:ring-3",
                  active && option.activeClass,
                )}
              >
                <input
                  type="radio"
                  name={`resposta_${id}`}
                  value={option.value}
                  checked={active}
                  data-response-status={option.value}
                  aria-label={option.full}
                  onChange={() => escolherStatus(option.value)}
                  className="sr-only"
                />
                <OptionIcon
                  className={cn("size-5", !active && option.idleIcon)}
                  aria-hidden
                />
                <span>{option.label}</span>
                {active ? (
                  <CheckCircle2
                    className="absolute top-1 right-1 size-4"
                    aria-hidden
                  />
                ) : null}
              </label>
            );
          })}
        </fieldset>

        {needsAttention && validationMessage ? (
          <p role="alert" className="text-warning flex items-start gap-2 text-sm font-medium">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {validationMessage}
          </p>
        ) : null}

        {priced && packaging && conversionAttribute ? (
          <PackagingSale
            item={item}
            itemId={id}
            attr={conversionAttribute}
            price={price}
            onPriceChange={(value) => {
              dirtyRef.current = true;
              setCommaTyped(false);
              setPrice(value);
            }}
            priceInvalid={flagged && !validPrice}
            factor={rawFactor}
            onFactorChange={(value) => {
              dirtyRef.current = true;
              setAttributeValues((current) => ({
                ...current,
                [conversionAttribute.attribute_definition_id]: value,
              }));
            }}
            factorInvalid={flagged && Boolean(invalidConversionAttribute)}
            numericFactor={numericFactor}
            normalizedPrice={normalizedPrice}
            onAdvance={() => scrollToNextCard(id)}
          />
        ) : null}

        {priced && !packaging ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`preco_${id}`}
              className="text-fg text-sm font-medium"
            >
              Preço por {item.pricing_unit.symbol}
            </label>
            <div className="relative sm:max-w-xs">
              <span
                aria-hidden
                className="text-fg-muted pointer-events-none absolute inset-y-0 left-3 flex items-center text-base"
              >
                R$
              </span>
              <Input
                id={`preco_${id}`}
                name={`preco_${id}`}
                // Só dígitos entram, então o teclado numérico simples basta —
                // uma tecla de vírgula aqui seria uma tecla que não faz nada.
                inputMode="numeric"
                enterKeyHint="next"
                placeholder="0,00"
                autoComplete="off"
                value={price}
                aria-invalid={flagged && !validPrice}
                aria-describedby={`preco_dica_${id}`}
                onChange={(event) => {
                  dirtyRef.current = true;
                  const typed = (event.nativeEvent as InputEvent).data;
                  setCommaTyped(typed === "," || typed === ".");
                  setPrice(formatarCentavos(event.target.value));
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // Enter aqui significa "próximo", não "enviar tudo".
                  event.preventDefault();
                  if (validPrice) scrollToNextCard(id);
                }}
                className="h-12 pl-10 text-lg tabular-nums"
              />
            </div>
            <p
              id={`preco_dica_${id}`}
              className={cn(
                "text-[13px]",
                commaTyped || veryLowPrice ? "text-warning font-medium" : "text-fg-muted",
              )}
              role={commaTyped || veryLowPrice ? "status" : undefined}
            >
              {commaTyped
                ? "Não precisa de vírgula: digite só os números. 450 vira R$ 4,50."
                : veryLowPrice
                  ? `Confira: R$ ${formatUnitPrice(numericPrice)} é um valor muito baixo. Para R$ 5,00, digite 500.`
                  : "Digite só os números: 450 vira R$ 4,50."}
            </p>
          </div>
        ) : null}

        {suspiciousPrice && historicalPrice !== null ? (
          <div className="border-warning/35 bg-warning-soft text-warning flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <strong className="block">Confira este preço antes de enviar.</strong>
              <span className="text-fg-muted mt-0.5 block text-[13px] leading-relaxed">
                O valor está bem diferente do último preço pago à sua empresa:{" "}
                R$ {formatUnitPrice(historicalPrice)}
                {item.last_supplier_price_at
                  ? ` em ${new Intl.DateTimeFormat("pt-BR").format(new Date(item.last_supplier_price_at))}`
                  : ""}. Se não puder atender agora, escolha “Sem estoque
                agora”; se não fornecer este item, escolha “Não trabalho”.
              </span>
            </div>
          </div>
        ) : null}

        {priced &&
        (packaging ? otherAttributes.length > 0 : item.attributes.length > 0) ? (
          <section className="flex flex-col gap-3">
            {conversionAttribute && !packaging ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <Calculator className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <h3 className="text-fg text-sm font-semibold">Quanto vem em cada {item.pricing_unit.symbol}</h3>
                    <p className="text-fg-muted mt-0.5 text-[13px]">
                      Informe quantas {item.comparison_unit?.symbol ?? "unidades"} vêm em cada {item.pricing_unit.symbol}, para o comprador comparar tamanhos diferentes.
                    </p>
                  </div>
                </div>
                <AttributeField
                  attr={conversionAttribute}
                  itemId={id}
                  priced={priced}
                  value={attributeValues[conversionAttribute.attribute_definition_id] ?? ""}
                  onChange={(value) => {
                    dirtyRef.current = true;
                    setAttributeValues((current) => ({
                      ...current,
                      [conversionAttribute.attribute_definition_id]: value,
                    }));
                  }}
                />
                {conversionAttribute.suggested_value_numeric !== null ? (
                  <p className="text-fg-muted text-[13px]">
                    Igual à última cotação
                    {conversionAttribute.suggested_confirmed_at
                      ? ` (${new Intl.DateTimeFormat("pt-BR").format(new Date(conversionAttribute.suggested_confirmed_at))})`
                      : ""}
                    . Altere se mudou.
                  </p>
                ) : null}
                {normalizedPrice !== null && item.comparison_unit ? (
                  <p className="text-sm">
                    <span className="text-fg-muted">Custo comparável: </span>
                    <strong className="text-primary tabular-nums">
                      R$ {formatUnitPrice(normalizedPrice)} / {item.comparison_unit.symbol}
                    </strong>
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {otherAttributes.map((attr) => (
                <AttributeField
                  key={attr.attribute_definition_id}
                  attr={attr}
                  itemId={id}
                  priced={priced}
                  value={attributeValues[attr.attribute_definition_id] ?? ""}
                  onChange={(value) => {
                    dirtyRef.current = true;
                    setAttributeValues((current) => ({
                      ...current,
                      [attr.attribute_definition_id]: value,
                    }));
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Observação é opcional: fica recolhida e o campo continua no formulário. */}
        {status !== "" && !obsOpen ? (
          <button
            type="button"
            onClick={() => setObsOpen(true)}
            className="text-primary focus-visible:ring-ring/50 -my-1 min-h-11 self-start rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
          >
            + Observação (marca, prazo, substituição)
          </button>
        ) : null}
        <div className={cn("flex flex-col gap-1.5", !obsOpen && "hidden")}>
          <label htmlFor={`obs_${id}`} className="text-fg text-sm font-medium">
            Observação <span className="text-fg-muted font-normal">(opcional)</span>
          </label>
          <Input
            id={`obs_${id}`}
            name={`obs_${id}`}
            placeholder="Marca, prazo, condição ou substituição…"
            maxLength={300}
            value={obs}
            onChange={(event) => {
              dirtyRef.current = true;
              setObs(event.target.value);
            }}
            className="h-11"
          />
        </div>
      </div>
    </article>
  );
}

/**
 * Venda de embalagem: preço e conteúdo no mesmo campo.
 *
 * Para uma embalagem os dois números não dizem nada separados — R$ 40 o fardo
 * só vira comparável quando se sabe que o fardo traz 500 unidades. O formulário
 * antigo pedia o preço em cima, a observação opcional ao lado e o conteúdo lá
 * embaixo, atrás de uma borda: os dois números que formam a razão eram os mais
 * distantes do cartão.
 *
 * A frase também era de contagem — "quantas {un} vêm em cada {fd}". Escrita com
 * o nome da unidade e no plural certo ela atende igualmente o que se vende por
 * pacote, por metro e por quilo, que é o mesmo cálculo com outro substantivo.
 */
function PackagingSale({
  item,
  itemId,
  attr,
  price,
  onPriceChange,
  priceInvalid,
  factor,
  onFactorChange,
  factorInvalid,
  numericFactor,
  normalizedPrice,
  onAdvance,
}: {
  item: PublicQuotationItem;
  itemId: string;
  attr: PublicQuotationItem["attributes"][number];
  price: string;
  onPriceChange: (value: string) => void;
  priceInvalid: boolean;
  factor: string;
  onFactorChange: (value: string) => void;
  factorInvalid: boolean;
  numericFactor: number;
  normalizedPrice: number | null;
  onAdvance: () => void;
}) {
  const fieldName = `attr_${itemId}_${attr.attribute_definition_id}__${attr.data_type}`;
  // Nada de artigo definido antes do nome da unidade: "o preço do caixa" sai
  // errado, e o gênero não se deduz do `kind`. "1 caixa" e "cada caixa"
  // funcionam em qualquer gênero.
  const embalagem = unitWord(item.pricing_unit);
  // A unidade de comparação é o que o comprador enxerga no fim. Quando ela
  // ainda não está no item, a do próprio atributo de conversão responde.
  const conteudo = item.comparison_unit ?? attr.unit;
  const conteudoUm = unitWord(conteudo, 1) || "unidade";
  const conteudoVarios = unitWord(conteudo, 2) || "unidades";

  const pedido = Number(item.requested_quantity);
  // A quantidade pedida vem na unidade de compra, e o fator é por unidade de
  // preço. Projetar o total só é honesto quando as duas são a mesma — que é
  // como a embalagem fica depois da 0109.
  const mesmaUnidade = item.purchase_unit.id === item.pricing_unit.id;
  const totalConteudo =
    mesmaUnidade && Number.isFinite(numericFactor) && numericFactor > 0
      ? pedido * numericFactor
      : null;

  const faltando =
    !price.trim() && !factor.trim()
      ? `Preencha os dois campos para ver o custo por ${conteudoUm}.`
      : !price.trim()
        ? `Falta o preço de 1 ${embalagem}.`
        : `Falta quanto vem em cada ${embalagem}.`;

  return (
    <section
      aria-label={`Como você vende ${item.product_name}`}
      className="flex flex-col gap-3"
    >
      <div>
        <h3 className="text-fg text-sm font-semibold">Como você vende</h3>
        <p className="text-fg-muted mt-0.5 text-[13px]">
          Quanto custa 1 {embalagem} e quanto vem dentro. É assim que o
          comprador compara embalagens de tamanhos diferentes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`preco_${itemId}`}
            className="text-fg text-sm font-medium"
          >
            Preço de 1 {embalagem}
          </label>
          <div className="relative">
            <span
              aria-hidden
              className="text-fg-muted pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
            >
              R$
            </span>
            <Input
              id={`preco_${itemId}`}
              name={`preco_${itemId}`}
              // Só dígitos entram, então o teclado numérico simples basta —
              // uma tecla de vírgula aqui seria uma tecla que não faz nada.
              inputMode="numeric"
              enterKeyHint="next"
              placeholder="0,00"
              value={price}
              aria-invalid={priceInvalid}
              onChange={(event) =>
                onPriceChange(formatarCentavos(event.target.value))
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                document.getElementById(fieldName)?.focus();
              }}
              className="h-12 pl-10 text-lg tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldName} className="text-fg text-sm font-medium">
            Cada {embalagem} tem
            {attr.required ? (
              <span className="text-destructive ml-1" aria-label="obrigatório">
                *
              </span>
            ) : null}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={fieldName}
              name={fieldName}
              inputMode="decimal"
              enterKeyHint="next"
              placeholder="0"
              value={factor}
              required={attr.required}
              aria-invalid={factorInvalid}
              min="0.000001"
              onChange={(event) => onFactorChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onAdvance();
              }}
              className="h-12 w-28 text-lg tabular-nums"
            />
            <span className="text-fg text-sm">{conteudoVarios}</span>
          </div>
          {attr.suggested_value_numeric !== null ? (
            <p className="text-fg-muted text-[13px]">
              Valor da última cotação
              {attr.suggested_confirmed_at
                ? `, confirmado em ${new Intl.DateTimeFormat("pt-BR").format(new Date(attr.suggested_confirmed_at))}`
                : ""}
              . Você confirmará no envio ou poderá alterar agora.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-border border-t pt-3">
        {normalizedPrice !== null ? (
          <>
            <p className="text-primary text-base font-semibold tabular-nums">
              R$ {formatUnitPrice(normalizedPrice)}{" "}
              <span className="text-fg-muted text-sm font-normal">
                por {conteudoUm}
              </span>
            </p>
            {totalConteudo !== null ? (
              <p className="text-fg-muted mt-1 text-[13px] tabular-nums">
                {QTY.format(pedido)} {unitWord(item.purchase_unit, pedido)} ={" "}
                {QTY.format(totalConteudo)} {conteudoVarios} no total
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-fg-muted text-sm">{faltando}</p>
        )}
      </div>
    </section>
  );
}

function AttributeField({
  attr,
  itemId,
  priced,
  value,
  onChange,
}: {
  attr: PublicQuotationItem["attributes"][number];
  itemId: string;
  priced: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldName = `attr_${itemId}_${attr.attribute_definition_id}__${attr.data_type}`;
  const label = attr.unit ? `${attr.name} (${attr.unit.symbol})` : attr.name;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldName} className="text-fg text-sm font-medium">
        {label}
        {attr.required ? <span className="text-destructive ml-1" aria-label="obrigatório">*</span> : null}
      </label>
      {attr.data_type === "boolean" ? (
        <ThemedSelect
          id={fieldName}
          name={fieldName}
          value={value}
          onValueChange={onChange}
          disabled={!priced}
          emptyOptionLabel="Não informado"
          options={[{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]}
        />
      ) : (
        <Input
          id={fieldName}
          name={fieldName}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!priced}
          required={priced && attr.required}
          inputMode={attr.data_type === "numeric" ? "decimal" : undefined}
          min={attr.is_conversion_factor ? "0.000001" : undefined}
        />
      )}
    </div>
  );
}

export function QuotationResponseForm({
  token,
  items,
}: {
  token: string;
  items: PublicQuotationItem[];
}) {
  const [state, formAction, pending] = useActionState<
    SubmitQuotationState,
    FormData
  >(submitQuotation, { error: null });
  const [resolved, setResolved] = React.useState<Record<string, boolean>>({});
  const [historicalPresentations, setHistoricalPresentations] = React.useState<
    Record<string, HistoricalPresentation>
  >({});
  const [suspiciousPrices, setSuspiciousPrices] = React.useState<
    Record<string, SuspiciousPrice>
  >({});
  const [confirmationOpen, setConfirmationOpen] = React.useState(false);
  const [priceConfirmationOpen, setPriceConfirmationOpen] =
    React.useState(false);
  const [flagged, setFlagged] = React.useState<Record<string, boolean>>({});
  const [bulk, setBulk] = React.useState<Record<string, BulkSignal>>({});
  const formRef = React.useRef<HTMLFormElement>(null);
  const allowHistoricalSubmit = React.useRef(false);
  const allowSuspiciousSubmit = React.useRef(false);
  const pendentes = items.filter((item) => !item.already_answered);
  const completed = pendentes.filter(
    (item) => resolved[item.supplier_quotation_item_id],
  ).length;
  const remaining = pendentes.length - completed;
  const progress =
    pendentes.length > 0 ? (completed / pendentes.length) * 100 : 0;
  const updateResolved = React.useCallback((id: string, value: boolean) => {
    setResolved((current) =>
      current[id] === value ? current : { ...current, [id]: value },
    );
  }, []);
  const updateHistoricalPresentation = React.useCallback(
    (id: string, presentation: HistoricalPresentation | null) => {
      setHistoricalPresentations((current) => {
        if (!presentation) {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }
        const previous = current[id];
        if (
          previous?.value === presentation.value &&
          previous.attributeDefinitionId === presentation.attributeDefinitionId
        ) {
          return current;
        }
        return { ...current, [id]: presentation };
      });
    },
    [],
  );
  const updateSuspiciousPrice = React.useCallback(
    (id: string, suspicious: SuspiciousPrice | null) => {
      setSuspiciousPrices((current) => {
        const previous = current[id];
        if (!suspicious) {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          allowSuspiciousSubmit.current = false;
          return next;
        }
        if (
          previous?.enteredPrice === suspicious.enteredPrice &&
          previous.historicalPrice === suspicious.historicalPrice
        ) {
          return current;
        }
        allowSuspiciousSubmit.current = false;
        return { ...current, [id]: suspicious };
      });
    },
    [],
  );
  const reusedPresentations = Object.values(historicalPresentations);
  const pricesToConfirm = Object.values(suspiciousPrices);
  const draftsJson = React.useSyncExternalStore(
    subscribeNone,
    () =>
      readInitialDrafts(
        token,
        pendentes.map((item) => item.supplier_quotation_item_id),
      ),
    () => "{}",
  );
  const drafts = React.useMemo(() => {
    const raw = JSON.parse(draftsJson) as Record<string, string>;
    const parsed: Record<string, Draft> = {};
    for (const [id, value] of Object.entries(raw)) {
      const draft = parseDraft(value);
      if (draft && draft.status) parsed[id] = draft;
    }
    return parsed;
  }, [draftsJson]);
  const restoredCount = Object.keys(drafts).length;

  // Resposta enviada: o rascunho deste link não tem mais função.
  React.useEffect(() => {
    if (!state.submitted) return;
    try {
      for (const item of items) {
        window.localStorage.removeItem(
          draftKey(token, item.supplier_quotation_item_id),
        );
      }
    } catch {
      // nada a limpar
    }
  }, [state.submitted, items, token]);

  function goToFirstPending(options: { flag: boolean }) {
    const firstPending = pendentes.find(
      (item) => !resolved[item.supplier_quotation_item_id],
    );
    if (!firstPending) return;
    const id = firstPending.supplier_quotation_item_id;
    if (options.flag) setFlagged((current) => ({ ...current, [id]: true }));

    const card = document.getElementById(`cotacao-item-${id}`);
    card?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    const selectedStatus = card?.querySelector<HTMLInputElement>(
      'input[name^="status_"]',
    )?.value;
    const field =
      selectedStatus === "priced"
        ? card?.querySelector<HTMLElement>('input[name^="preco_"]')
        : card?.querySelector<HTMLElement>("[data-response-status]");
    window.setTimeout(() => field?.focus({ preventScroll: true }), 350);
  }

  function reviewSuspiciousPrices() {
    const first = pricesToConfirm[0];
    setPriceConfirmationOpen(false);
    if (!first) return;
    const card = document.getElementById(`cotacao-item-${first.itemId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(
      () => document.getElementById(`preco_${first.itemId}`)?.focus(),
      350,
    );
  }

  function confirmSuspiciousPrices() {
    allowSuspiciousSubmit.current = true;
    setPriceConfirmationOpen(false);
    window.requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  function reviewHistoricalPresentations() {
    const first = reusedPresentations[0];
    setConfirmationOpen(false);
    if (!first) return;
    const card = document.getElementById(`cotacao-item-${first.itemId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(
      () =>
        document
          .getElementById(
            `attr_${first.itemId}_${first.attributeDefinitionId}__numeric`,
          )
          ?.focus({ preventScroll: true }),
      350,
    );
  }

  function confirmHistoricalPresentations() {
    allowHistoricalSubmit.current = true;
    setConfirmationOpen(false);
    window.requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  if (state.submitted) {
    return (
      <div
        role="status"
        className="border-border bg-success-soft text-success flex flex-col items-center gap-2 rounded-2xl border px-6 py-10 text-center"
      >
        <CheckCircle2 className="size-7" aria-hidden />
        <p className="text-lg font-semibold">Resposta enviada com sucesso.</p>
        <p className="max-w-md text-sm">
          O comprador já recebeu seus preços e disponibilidades. Se precisar
          corrigir algo, fale diretamente com ele. Pode fechar esta página.
        </p>
      </div>
    );
  }

  if (pendentes.length === 0) {
    return (
      <div className="border-border bg-surface text-fg-muted rounded-2xl border px-6 py-10 text-center">
        <CheckCircle2
          className="text-success mx-auto mb-2 size-6"
          aria-hidden
        />
        <p className="text-fg font-medium">
          Todos os itens já foram respondidos.
        </p>
        <p className="mt-1 text-sm">
          Para corrigir algum preço, fale com o comprador.
        </p>
      </div>
    );
  }

  const groups = new Map<string, PublicQuotationItem[]>();
  for (const item of pendentes) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  const allDone = completed === pendentes.length;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        if (!allDone) {
          // Enter no teclado ou envio forçado com itens faltando: leva ao
          // primeiro, sem pintar a página inteira de erro.
          event.preventDefault();
          goToFirstPending({ flag: true });
          return;
        }
        if (pricesToConfirm.length > 0 && !allowSuspiciousSubmit.current) {
          event.preventDefault();
          setPriceConfirmationOpen(true);
          return;
        }
        if (
          reusedPresentations.length > 0 &&
          !allowHistoricalSubmit.current
        ) {
          event.preventDefault();
          setConfirmationOpen(true);
          return;
        }
        allowHistoricalSubmit.current = false;
        allowSuspiciousSubmit.current = false;
      }}
      onInvalid={(event) => {
        const card = (event.target as HTMLElement).closest("article");
        const itemId = card?.id.replace("cotacao-item-", "");
        if (itemId) setFlagged((current) => ({ ...current, [itemId]: true }));
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <input type="hidden" name="token" value={token} />

      {restoredCount > 0 ? (
        <p
          role="status"
          className="bg-primary-soft text-fg rounded-lg px-3 py-2 text-sm"
        >
          Retomamos de onde você parou: {restoredCount}{" "}
          {restoredCount === 1 ? "resposta" : "respostas"} neste aparelho.
        </p>
      ) : null}

      {[...groups.entries()].map(([group, groupItems]) => {
        const unresolvedInGroup = groupItems.filter(
          (item) => !resolved[item.supplier_quotation_item_id],
        ).length;
        const groupBulk = bulk[group];
        const appliedByGroup = groupBulk && !groupBulk.undo;
        return (
          <section key={group} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
              <h2 className="text-fg text-base font-semibold">
                {group}{" "}
                <span className="text-fg-muted text-sm font-normal">
                  · {groupItems.length}{" "}
                  {groupItems.length === 1 ? "item" : "itens"}
                </span>
              </h2>
              {appliedByGroup ? (
                <button
                  type="button"
                  onClick={() =>
                    setBulk((current) => ({
                      ...current,
                      [group]: {
                        nonce: (current[group]?.nonce ?? 0) + 1,
                        value: "",
                        undo: true,
                      },
                    }))
                  }
                  className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                >
                  Desfazer “Não trabalho” em bloco
                </button>
              ) : unresolvedInGroup >= 2 ? (
                <button
                  type="button"
                  onClick={() =>
                    setBulk((current) => ({
                      ...current,
                      [group]: {
                        nonce: (current[group]?.nonce ?? 0) + 1,
                        value: "does_not_supply",
                        undo: false,
                      },
                    }))
                  }
                  className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                >
                  Não trabalho com os {unresolvedInGroup} que faltam
                </button>
              ) : null}
            </div>
            {groupItems.map((item) => (
              <ItemCard
                // O rascunho chega depois da hidratação: remonta o cartão uma vez.
                key={`${item.supplier_quotation_item_id}${drafts[item.supplier_quotation_item_id] ? ":r" : ""}`}
                token={token}
                initialDraft={drafts[item.supplier_quotation_item_id] ?? null}
                item={item}
                flagged={Boolean(flagged[item.supplier_quotation_item_id])}
                bulk={bulk[group]}
                onResolvedChange={updateResolved}
                onHistoricalPresentationChange={updateHistoricalPresentation}
                onSuspiciousPriceChange={updateSuspiciousPrice}
              />
            ))}
          </section>
        );
      })}

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {/* Uma barra só, colada ao polegar: quanto falta e o próximo passo. */}
      <div className="border-border bg-surface sticky bottom-0 z-20 -mx-3 border-t px-3 py-2.5 shadow-[0_-8px_20px_-16px_rgba(0,0,0,.45)] sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-fg text-sm tabular-nums">
              <strong>{completed}</strong> de {pendentes.length} respondidos
              {remaining > 0 ? (
                <span className="text-fg-muted"> · faltam {remaining}</span>
              ) : null}
            </p>
            <div
              className="bg-surface-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="Itens respondidos"
              aria-valuemin={0}
              aria-valuemax={pendentes.length}
              aria-valuenow={completed}
            >
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {allDone ? (
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="h-12 shrink-0"
            >
              {pending
                ? "Enviando…"
                : pendentes.length === 1
                  ? "Enviar resposta"
                  : `Enviar ${pendentes.length} respostas`}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="h-12 shrink-0"
              onClick={() => goToFirstPending({ flag: false })}
            >
              {completed === 0 ? "Começar" : "Próximo item"}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={priceConfirmationOpen}
        onOpenChange={setPriceConfirmationOpen}
      >
        <DialogContent size="sm" impedirFechamentoAcidental>
          <DialogHeader>
            <DialogTitle>Confirme os preços fora do padrão</DialogTitle>
            <DialogDescription>
              Estes valores estão muito diferentes do último preço pago à sua
              empresa. Confira se não houve erro de digitação.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="divide-border overflow-hidden rounded-lg border">
              {pricesToConfirm.map((entry) => (
                <li key={entry.itemId} className="px-3 py-2.5 text-sm">
                  <span className="text-fg block font-medium wrap-anywhere">
                    {entry.productName}
                  </span>
                  <span className="text-fg-muted mt-1 block text-[13px]">
                    Digitado:{" "}
                    <strong className="text-warning tabular-nums">
                      R$ {formatUnitPrice(entry.enteredPrice)}
                    </strong>{" "}
                    · último pago:{" "}
                    <strong className="text-fg tabular-nums">
                      R$ {formatUnitPrice(entry.historicalPrice)}
                    </strong>
                    {entry.historicalAt
                      ? ` em ${new Intl.DateTimeFormat("pt-BR").format(new Date(entry.historicalAt))}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="bg-warning-soft text-fg-muted mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
              <AlertTriangle
                className="text-warning mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <p>
                Se não puder entregar agora, volte e escolha “Sem
                disponibilidade”. Se não fornecer o produto, escolha “Não
                trabalho com este produto”.
              </p>
            </div>
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={reviewSuspiciousPrices}
            >
              Voltar e conferir
            </Button>
            <Button type="button" onClick={confirmSuspiciousPrices}>
              Confirmo os valores
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent size="sm" impedirFechamentoAcidental>
          <DialogHeader>
            <DialogTitle>Confirme as apresentações</DialogTitle>
            <DialogDescription>
              Estas quantidades vieram do histórico deste fornecedor. Confirme
              que continuam iguais antes de enviar a cotação.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="divide-border overflow-hidden rounded-lg border">
              {reusedPresentations.map((presentation) => (
                <li
                  key={presentation.itemId}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="text-fg min-w-0 font-medium wrap-anywhere">
                    {presentation.productName}
                  </span>
                  <strong className="text-primary shrink-0 tabular-nums">
                    {QTY.format(presentation.value)} {presentation.unit ?? "un"}
                    /pacote
                  </strong>
                </li>
              ))}
            </ul>
            <p className="text-fg-muted mt-3 text-sm">
              Ao confirmar, essas apresentações ficam registradas como
              reconfirmadas nesta cotação.
            </p>
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={reviewHistoricalPresentations}>
              Revisar quantidades
            </Button>
            <Button type="button" onClick={confirmHistoricalPresentations}>
              Confirmo que nada mudou
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
