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
import { useFormStatus } from "react-dom";

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
/** A disponibilidade vem antes do preço para nenhuma alternativa passar batida. */
const RESPONSE_OPTIONS = [
  {
    value: "priced",
    label: "Tenho disponível",
    description: "Consigo atender e vou informar o preço",
    icon: PackageCheck,
    iconClass: "bg-success-soft text-success",
    activeClass:
      "border-success/50 bg-success-soft ring-success/15 ring-2",
  },
  {
    value: "unavailable",
    label: "Sem disponibilidade agora",
    description: "Trabalho com o produto, mas não consigo atender desta vez",
    icon: Clock3,
    iconClass: "bg-warning-soft text-warning",
    activeClass:
      "border-warning/50 bg-warning-soft ring-warning/15 ring-2",
  },
  {
    value: "does_not_supply",
    label: "Não trabalho com este produto",
    description: "Não forneço este item",
    icon: PackageX,
    iconClass: "bg-destructive-soft text-destructive",
    activeClass:
      "border-destructive/45 bg-destructive-soft ring-destructive/10 ring-2",
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

function SubmitButton({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const { pending } = useFormStatus();
  const ready = completed === total;
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending
        ? "Enviando…"
        : ready
          ? `Enviar ${total === 1 ? "resposta" : `${total} respostas`}`
          : `Revisar ${total - completed} ${total - completed === 1 ? "pendente" : "pendentes"}`}
    </Button>
  );
}

function ItemCard({
  item,
  onResolvedChange,
  onHistoricalPresentationChange,
  onSuspiciousPriceChange,
  showValidation,
}: {
  item: PublicQuotationItem;
  onResolvedChange: (id: string, resolved: boolean) => void;
  onHistoricalPresentationChange: (
    id: string,
    presentation: HistoricalPresentation | null,
  ) => void;
  onSuspiciousPriceChange: (
    id: string,
    suspicious: SuspiciousPrice | null,
  ) => void;
  showValidation: boolean;
}) {
  const id = item.supplier_quotation_item_id;
  const [status, setStatus] = React.useState<ResponseStatus>("");
  const [price, setPrice] = React.useState("");
  const [attributeValues, setAttributeValues] = React.useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        item.attributes.map((attribute) => [
          attribute.attribute_definition_id,
          attribute.is_conversion_factor &&
          attribute.suggested_value_numeric !== null
            ? String(attribute.suggested_value_numeric).replace(".", ",")
            : "",
        ]),
      ),
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
      ? "Escolha se consegue atender este produto."
      : priced && !validPrice
      ? price.trim()
        ? "Informe um preço válido e maior que zero."
        : "Informe o preço ou diga que não consegue atender."
      : priced && missingRequiredAttribute
        ? `Informe ${missingRequiredAttribute.name.toLocaleLowerCase("pt-BR")}.`
        : priced && invalidConversionAttribute
          ? `${invalidConversionAttribute.name} deve ser maior que zero.`
          : null;
  const conversionAttribute = item.attributes.find(
    (attribute) => attribute.is_conversion_factor,
  );
  const otherAttributes = item.attributes.filter(
    (attribute) => !attribute.is_conversion_factor,
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

  function escolherStatus(proximo: ResponseStatus) {
    setStatus(proximo);
    if (proximo === "priced") {
      window.requestAnimationFrame(() =>
        document.getElementById(`preco_${id}`)?.focus(),
      );
    } else {
      setPrice("");
    }
  }

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

  return (
    <article
      id={`cotacao-item-${id}`}
      className={cn(
        "border-border bg-surface scroll-mt-24 overflow-hidden rounded-xl border transition-colors",
        resolved && "border-success/35",
        showValidation && validationMessage && "border-destructive/60",
      )}
    >
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name={`nome_${id}`} value={item.product_name} />

      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-fg font-medium">{item.product_name}</p>
          <p className="text-fg-muted mt-0.5 text-sm">
            Quantidade solicitada:{" "}
            <strong className="text-fg tabular-nums">
              {QTY.format(Number(item.requested_quantity))}{" "}
              {item.purchase_unit.symbol}
            </strong>
          </p>
          {item.notes ? (
            <p className="text-fg-subtle mt-1 text-xs">{item.notes}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            resolved
              ? "bg-success-soft text-success"
              : "bg-warning-soft text-warning",
          )}
        >
          {resolved ? "Preenchido" : "Pendente"}
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {/* O status viaja escondido, mas a escolha é deliberadamente explícita. */}
        <input type="hidden" name={`status_${id}`} value={status} />

        {showValidation && validationMessage ? (
          <p
            role="alert"
            className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {validationMessage}
          </p>
        ) : null}

        <div
          role="group"
          aria-label={`Disponibilidade de ${item.product_name}`}
          className="border-border bg-surface-sunken flex flex-col gap-3 rounded-xl border p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-fg text-sm font-semibold">
              Você consegue fornecer este produto nesta cotação?
            </p>
            <span className="bg-primary-soft text-primary rounded-full px-2.5 py-1 text-[11px] font-semibold">
              Resposta obrigatória
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {RESPONSE_OPTIONS.map((option) => {
              const active = status === option.value;
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  data-response-status={option.value}
                  aria-pressed={active}
                  onClick={() => escolherStatus(option.value)}
                  className={cn(
                    "border-border bg-surface hover:border-fg-subtle focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:ring-3 focus-visible:outline-none",
                    active && option.activeClass,
                  )}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        option.iconClass,
                      )}
                    >
                      <OptionIcon className="size-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span className="text-fg-muted mt-1 block text-xs leading-snug">
                        {option.description}
                      </span>
                    </span>
                    {active ? (
                      <CheckCircle2
                        className="text-fg size-4.5 shrink-0"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {priced && packaging && conversionAttribute ? (
          <PackagingSale
            item={item}
            itemId={id}
            attr={conversionAttribute}
            price={price}
            onPriceChange={setPrice}
            priceInvalid={showValidation && !validPrice}
            factor={rawFactor}
            onFactorChange={(value) =>
              setAttributeValues((current) => ({
                ...current,
                [conversionAttribute.attribute_definition_id]: value,
              }))
            }
            factorInvalid={showValidation && Boolean(invalidConversionAttribute)}
            numericFactor={numericFactor}
            normalizedPrice={normalizedPrice}
          />
        ) : null}

        <div
          className={cn("grid gap-3", !packaging && "sm:grid-cols-[11rem_1fr]")}
        >
          {priced ? (
            packaging ? null : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`preco_${id}`}
                  className="text-fg text-sm font-medium"
                >
                  Preço por {item.pricing_unit.symbol}
                </label>
                <Input
                  id={`preco_${id}`}
                  name={`preco_${id}`}
                  // Só dígitos entram, então o teclado numérico simples basta —
                  // uma tecla de vírgula aqui seria uma tecla que não faz nada.
                  inputMode="numeric"
                  enterKeyHint="next"
                  placeholder="0,00"
                  value={price}
                  aria-invalid={showValidation && !validPrice}
                  onChange={(event) => setPrice(formatarCentavos(event.target.value))}
                />
              </div>
            )
          ) : status === "" ? (
            <div className="bg-surface-sunken text-fg-muted flex items-center rounded-lg px-3 py-2 text-sm">
              Escolha uma opção acima para continuar.
            </div>
          ) : (
            <div className="bg-surface-sunken text-fg-muted flex items-center rounded-lg px-3 py-2 text-sm">
              Preço não necessário para a opção escolhida.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`obs_${id}`}
              className="text-fg text-sm font-medium"
            >
              Observação <span className="text-fg-subtle">(opcional)</span>
            </label>
            <Input
              id={`obs_${id}`}
              name={`obs_${id}`}
              placeholder="Marca, prazo, condição ou substituição…"
              maxLength={300}
            />
          </div>
        </div>

        {suspiciousPrice && historicalPrice !== null ? (
          <div className="border-warning/35 bg-warning-soft text-warning flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <strong className="block">Confira este preço antes de enviar.</strong>
              <span className="text-fg-muted mt-0.5 block text-xs leading-relaxed">
                O valor está bem diferente do último preço pago à sua empresa:{" "}
                R$ {formatUnitPrice(historicalPrice)}
                {item.last_supplier_price_at
                  ? ` em ${new Intl.DateTimeFormat("pt-BR").format(new Date(item.last_supplier_price_at))}`
                  : ""}. Se não puder atender agora, escolha “Sem disponibilidade”;
                se não fornecer este item, escolha “Não trabalho com este
                produto”.
              </span>
            </div>
          </div>
        ) : null}

        {priced &&
        (packaging ? otherAttributes.length > 0 : item.attributes.length > 0) ? (
          <section className="border-border border-t pt-4">
            {conversionAttribute && !packaging ? (
              <div className="border-primary/25 bg-primary-soft mb-3 rounded-xl border p-3">
                <div className="mb-3 flex items-start gap-2">
                  <Calculator className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <h3 className="text-fg text-sm font-semibold">Apresentação ofertada</h3>
                    <p className="text-fg-muted mt-0.5 text-xs">
                      Informe quantas {item.comparison_unit?.symbol ?? "unidades"} vêm em cada {item.pricing_unit.symbol}. Assim o comprador compara pacotes de tamanhos diferentes corretamente.
                    </p>
                  </div>
                </div>
                <AttributeField
                  attr={conversionAttribute}
                  itemId={id}
                  priced={priced}
                  value={attributeValues[conversionAttribute.attribute_definition_id] ?? ""}
                  onChange={(value) =>
                    setAttributeValues((current) => ({
                      ...current,
                      [conversionAttribute.attribute_definition_id]: value,
                    }))
                  }
                />
                {conversionAttribute.suggested_value_numeric !== null ? (
                  <p className="text-fg-subtle mt-1.5 text-xs">
                    Valor da última cotação
                    {conversionAttribute.suggested_confirmed_at
                      ? `, confirmado em ${new Intl.DateTimeFormat("pt-BR").format(new Date(conversionAttribute.suggested_confirmed_at))}`
                      : ""}
                    . Você confirmará no envio ou poderá alterar agora.
                  </p>
                ) : null}
                {normalizedPrice !== null && item.comparison_unit ? (
                  <div className="border-primary/20 bg-surface mt-3 rounded-lg border px-3 py-2 text-sm">
                    <span className="text-fg-muted">Custo comparável: </span>
                    <strong className="text-primary tabular-nums">
                      R$ {formatUnitPrice(normalizedPrice)} / {item.comparison_unit.symbol}
                    </strong>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
            {otherAttributes.map((attr) => {
              return (
                <AttributeField
                  key={attr.attribute_definition_id}
                  attr={attr}
                  itemId={id}
                  priced={priced}
                  value={attributeValues[attr.attribute_definition_id] ?? ""}
                  onChange={(value) =>
                    setAttributeValues((current) => ({
                      ...current,
                      [attr.attribute_definition_id]: value,
                    }))
                  }
                />
              );
            })}
            </div>
          </section>
        ) : null}
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
      className="border-border bg-surface-sunken flex flex-col gap-3 rounded-xl border p-3 sm:p-4"
    >
      <div>
        <h3 className="text-fg text-sm font-semibold">Como você vende</h3>
        <p className="text-fg-muted mt-0.5 text-xs">
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
              className="text-fg-subtle pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
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
              className="h-11 pl-9 tabular-nums"
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
              className="h-11 w-24 tabular-nums"
            />
            <span className="text-fg text-sm">{conteudoVarios}</span>
          </div>
          {attr.suggested_value_numeric !== null ? (
            <p className="text-fg-subtle text-xs">
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
              <p className="text-fg-muted mt-1 text-xs tabular-nums">
                {QTY.format(pedido)} {unitWord(item.purchase_unit, pedido)} ={" "}
                {QTY.format(totalConteudo)} {conteudoVarios} no total
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-fg-subtle text-sm">{faltando}</p>
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
  const [state, formAction] = useActionState<SubmitQuotationState, FormData>(
    submitQuotation,
    { error: null },
  );
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
  const [showValidation, setShowValidation] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const allowHistoricalSubmit = React.useRef(false);
  const allowSuspiciousSubmit = React.useRef(false);
  const pendentes = items.filter((item) => !item.already_answered);
  const completed = pendentes.filter(
    (item) => resolved[item.supplier_quotation_item_id],
  ).length;
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

  function focusFirstPending() {
    const firstPending = pendentes.find(
      (item) => !resolved[item.supplier_quotation_item_id],
    );
    if (!firstPending) return;

    const card = document.getElementById(
      `cotacao-item-${firstPending.supplier_quotation_item_id}`,
    );
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      <div className="border-border bg-success-soft text-success flex flex-col items-center gap-2 rounded-2xl border px-6 py-10 text-center">
        <CheckCircle2 className="size-7" aria-hidden />
        <p className="font-semibold">Resposta enviada com sucesso.</p>
        <p className="max-w-md text-sm">
          O comprador já recebeu seus preços e disponibilidades. Se precisar
          corrigir algo, fale diretamente com ele.
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

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        if (completed !== pendentes.length) {
          event.preventDefault();
          setShowValidation(true);
          focusFirstPending();
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
        setShowValidation(true);
        event.currentTarget
          .querySelector(":invalid")
          ?.closest("article")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <input type="hidden" name="token" value={token} />

      <section className="border-border bg-surface sticky top-2 z-20 rounded-xl border p-3 shadow-sm sm:top-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-fg-muted flex items-center gap-2">
            <PackageCheck className="text-primary size-4" aria-hidden />
            Progresso do preenchimento
          </span>
          <strong className="text-fg tabular-nums">
            {completed}/{pendentes.length}
          </strong>
        </div>
        <div className="bg-surface-muted mt-2 h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-fg-subtle mt-2 text-xs">
          Em cada produto, escolha uma das três opções. Ao informar preço,
          digite só os números — os dois últimos são os centavos.
        </p>
      </section>

      {[...groups.entries()].map(([group, groupItems]) => (
        <section key={group} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
              {group}
            </h2>
            <span className="text-fg-subtle text-xs">
              {groupItems.length} {groupItems.length === 1 ? "item" : "itens"}
            </span>
          </div>
          {groupItems.map((item) => (
            <ItemCard
              key={item.supplier_quotation_item_id}
              item={item}
              onResolvedChange={updateResolved}
              onHistoricalPresentationChange={updateHistoricalPresentation}
              onSuspiciousPriceChange={updateSuspiciousPrice}
              showValidation={showValidation}
            />
          ))}
        </section>
      ))}

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="border-border bg-surface sticky bottom-0 z-20 -mx-3 flex flex-col gap-2 border-t px-3 py-3 shadow-[0_-8px_20px_-16px_rgba(0,0,0,.45)] sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border">
        <p className="text-fg-subtle text-center text-xs sm:max-w-sm sm:text-left">
          Confirme se tem, está sem disponibilidade ou não trabalha com cada
          produto antes de enviar.
        </p>
        <SubmitButton completed={completed} total={pendentes.length} />
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
                  <span className="text-fg-muted mt-1 block text-xs">
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
