"use client";

import { AlertCircle, CheckCircle2, PackageCheck } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  submitQuotation,
  type SubmitQuotationState,
} from "@/features/quotations/actions";
import type { PublicQuotationItem } from "@/features/quotations/public";
import { cn } from "@/lib/utils";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
/**
 * As duas saídas para quem NÃO vai dar preço.
 *
 * "Tenho disponível" não está aqui de propósito: se o comprador mandou o link,
 * é porque entende que o fornecedor trabalha com o item. Partir de "tem" e
 * pedir só o preço tira um clique de cada produto — e são muitos produtos por
 * rodada. Quem não puder atender diz por estes dois botões.
 */
const INDISPONIVEL_OPTIONS = [
  {
    value: "unavailable",
    label: "Sem disponibilidade agora",
    description: "Trabalho com o produto, mas não consigo atender desta vez",
  },
  {
    value: "does_not_supply",
    label: "Não trabalho com este produto",
    description: "Não forneço este item",
  },
] as const;

type ResponseStatus =
  | "priced"
  | (typeof INDISPONIVEL_OPTIONS)[number]["value"];

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
  showValidation,
}: {
  item: PublicQuotationItem;
  onResolvedChange: (id: string, resolved: boolean) => void;
  showValidation: boolean;
}) {
  const id = item.supplier_quotation_item_id;
  // Começa em "priced": o link já pressupõe que o fornecedor atende o item.
  const [status, setStatus] = React.useState<ResponseStatus>("priced");
  const [price, setPrice] = React.useState("");
  const priced = status === "priced";
  const numericPrice = Number(price.replace(/\./g, "").replace(",", "."));
  const validPrice =
    price.trim().length > 0 && Number.isFinite(numericPrice) && numericPrice > 0;
  const resolved = !priced || validPrice;
  const validationMessage =
    priced && !validPrice
      ? price.trim()
        ? "Informe um preço válido e maior que zero."
        : "Informe o preço ou diga que não consegue atender."
      : null;

  /** Clicar de novo na opção marcada volta para o preço. */
  function alternarIndisponivel(opcao: ResponseStatus) {
    const proximo = status === opcao ? "priced" : opcao;
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
        {/* O status viaja escondido: a escolha explícita é só a de NÃO atender. */}
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

        <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          {priced ? (
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
                inputMode="decimal"
                enterKeyHint="next"
                placeholder="0,00"
                value={price}
                aria-invalid={showValidation && !validPrice}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
          ) : (
            <div className="bg-surface-sunken text-fg-muted flex items-center rounded-lg px-3 py-2 text-sm">
              Não é necessário informar preço nesta opção.
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

        <div
          role="group"
          aria-label={`Não consegue atender ${item.product_name}?`}
          className="flex flex-col gap-2"
        >
          <p className="text-fg-muted text-xs">Não consegue atender?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {INDISPONIVEL_OPTIONS.map((option) => {
              const ativo = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => alternarIndisponivel(option.value)}
                  className={cn(
                    "border-border bg-surface-sunken hover:border-primary/45 focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
                    ativo && "border-primary bg-primary-soft",
                  )}
                >
                  <span className="text-fg block text-sm font-medium">
                    {option.label}
                  </span>
                  <span className="text-fg-muted mt-0.5 block text-xs leading-snug">
                    {ativo
                      ? "Marcado. Clique de novo para voltar a informar preço."
                      : option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {item.attributes.length > 0 ? (
          <section className="border-border grid gap-3 border-t pt-4 sm:grid-cols-2">
            {item.attributes.map((attr) => {
              const fieldName = `attr_${id}_${attr.attribute_definition_id}__${attr.data_type}`;
              const label = attr.unit
                ? `${attr.name} (${attr.unit.symbol})`
                : attr.name;

              return (
                <div
                  key={attr.attribute_definition_id}
                  className="flex flex-col gap-1.5"
                >
                  <label
                    htmlFor={fieldName}
                    className="text-fg text-sm font-medium"
                  >
                    {label}
                    {attr.required ? (
                      <span
                        className="text-destructive ml-1"
                        aria-label="obrigatório"
                      >
                        *
                      </span>
                    ) : null}
                  </label>
                  {attr.data_type === "boolean" ? (
                    <ThemedSelect
                      id={fieldName}
                      name={fieldName}
                      disabled={!priced}
                      emptyOptionLabel="Não informado"
                      options={[
                        { value: "true", label: "Sim" },
                        { value: "false", label: "Não" },
                      ]}
                    />
                  ) : (
                    <Input
                      id={fieldName}
                      name={fieldName}
                      disabled={!priced}
                      required={priced && attr.required}
                      inputMode={
                        attr.data_type === "numeric" ? "decimal" : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </section>
        ) : null}
      </div>
    </article>
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
  const [showValidation, setShowValidation] = React.useState(false);
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

  function focusFirstPending() {
    const firstPending = pendentes.find(
      (item) => !resolved[item.supplier_quotation_item_id],
    );
    if (!firstPending) return;

    const card = document.getElementById(
      `cotacao-item-${firstPending.supplier_quotation_item_id}`,
    );
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Pendente só existe em item sem preço, e o preço é o campo que resolve.
    const field = card?.querySelector<HTMLInputElement>('input[name^="preco_"]');
    window.setTimeout(() => field?.focus({ preventScroll: true }), 350);
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
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        if (completed === pendentes.length) return;
        event.preventDefault();
        setShowValidation(true);
        focusFirstPending();
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
          Basta informar o preço de cada produto. Só marque alguma coisa se não
          conseguir atender.
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
          Informe o preço de cada produto. Se não conseguir atender algum, use
          os botões do item.
        </p>
        <SubmitButton completed={completed} total={pendentes.length} />
      </div>
    </form>
  );
}
