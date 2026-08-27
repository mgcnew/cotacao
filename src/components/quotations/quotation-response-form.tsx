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
const STATUS_OPTIONS = [
  { value: "priced", label: "Tenho disponível — informar preço" },
  { value: "unavailable", label: "Sem disponibilidade nesta cotação" },
  { value: "does_not_supply", label: "Não trabalho com este produto" },
];

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
      disabled={pending || !ready}
      className="w-full sm:w-auto"
    >
      {pending
        ? "Enviando…"
        : ready
          ? `Enviar ${total === 1 ? "resposta" : `${total} respostas`}`
          : `Faltam ${total - completed}`}
    </Button>
  );
}

function ItemCard({
  item,
  onResolvedChange,
}: {
  item: PublicQuotationItem;
  onResolvedChange: (id: string, resolved: boolean) => void;
}) {
  const id = item.supplier_quotation_item_id;
  const [status, setStatus] = React.useState("priced");
  const [price, setPrice] = React.useState("");
  const priced = status === "priced";
  const resolved = !priced || price.trim().length > 0;

  React.useEffect(() => {
    onResolvedChange(id, resolved);
  }, [id, onResolvedChange, resolved]);

  return (
    <article
      className={cn(
        "border-border bg-surface overflow-hidden rounded-xl border transition-colors",
        resolved && "border-success/35",
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
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`status_${id}`}
            className="text-fg text-sm font-medium"
          >
            Disponibilidade
          </label>
          <ThemedSelect
            id={`status_${id}`}
            name={`status_${id}`}
            value={status}
            onValueChange={setStatus}
            options={STATUS_OPTIONS}
          />
          {status === "unavailable" ? (
            <p className="text-fg-subtle text-xs">
              Use quando você trabalha com o produto, mas não consegue atender
              esta compra agora.
            </p>
          ) : status === "does_not_supply" ? (
            <p className="text-fg-subtle text-xs">
              Esta informação ajuda o comprador a não solicitar o produto nas
              próximas cotações.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
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
              required={priced}
              disabled={!priced}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>

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
    <form action={formAction} className="flex flex-col gap-5">
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
          Confira antes de enviar. Preço, indisponibilidade ou “não trabalho”
          resolvem cada item.
        </p>
        <SubmitButton completed={completed} total={pendentes.length} />
      </div>
    </form>
  );
}
