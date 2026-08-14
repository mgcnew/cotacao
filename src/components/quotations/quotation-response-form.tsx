"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  submitQuotation,
  type SubmitQuotationState,
} from "@/features/quotations/actions";
import type { PublicQuotationItem } from "@/features/quotations/public";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending
        ? "Enviando…"
        : `Enviar resposta (${count} ${count === 1 ? "item" : "itens"})`}
    </Button>
  );
}

function ItemCard({ item }: { item: PublicQuotationItem }) {
  const id = item.supplier_quotation_item_id;

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4">
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name={`nome_${id}`} value={item.product_name} />

      <div>
        <p className="text-fg font-medium">{item.product_name}</p>
        <p className="text-fg-muted text-sm">
          Precisamos de{" "}
          <span className="text-fg font-medium tabular-nums">
            {QTY.format(Number(item.requested_quantity))}{" "}
            {item.purchase_unit.symbol}
          </span>
        </p>
        {item.notes ? (
          <p className="text-fg-subtle mt-1 text-sm">{item.notes}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`preco_${id}`} className="text-fg text-sm font-medium">
            Preço por {item.pricing_unit.symbol}
          </label>
          <Input
            id={`preco_${id}`}
            name={`preco_${id}`}
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`obs_${id}`} className="text-fg text-sm font-medium">
            Observação <span className="text-fg-subtle">(opcional)</span>
          </label>
          <Input
            id={`obs_${id}`}
            name={`obs_${id}`}
            placeholder="Prazo, marca, condição…"
          />
        </div>
      </div>

      {item.attributes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {item.attributes.map((attr) => {
            const fieldName = `attr_${id}_${attr.attribute_definition_id}__${attr.data_type}`;
            const label = attr.unit
              ? `${attr.name} (${attr.unit.symbol})`
              : attr.name;

            return (
              <div key={attr.attribute_definition_id} className="flex flex-col gap-1.5">
                <label htmlFor={fieldName} className="text-fg text-sm font-medium">
                  {label}
                </label>
                {attr.data_type === "boolean" ? (
                  <select
                    id={fieldName}
                    name={fieldName}
                    defaultValue=""
                    className={selectClass}
                  >
                    <option value="">—</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                ) : (
                  <Input
                    id={fieldName}
                    name={fieldName}
                    inputMode={attr.data_type === "numeric" ? "decimal" : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <label className="border-border text-fg-muted flex items-start gap-2 border-t pt-3 text-sm">
        <input
          type="checkbox"
          name={`nao_fornece_${id}`}
          className="accent-destructive mt-0.5 size-4"
        />
        <span>
          Não trabalho com este produto
          <span className="text-fg-subtle block text-xs">
            Marque só se você não vende este item. O preço digitado acima será
            descartado.
          </span>
        </span>
      </label>
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

  const pendentes = items.filter((i) => !i.already_answered);

  if (state.submitted) {
    return (
      <div className="border-border bg-success-soft text-success flex flex-col items-center gap-2 rounded-xl border px-6 py-10 text-center">
        <CheckCircle2 className="size-6" aria-hidden />
        <p className="font-medium">Resposta enviada. Obrigado!</p>
        <p className="text-sm">
          O comprador já consegue ver seus preços. Se precisar corrigir algo,
          fale com ele — por segurança, o mesmo item não pode ser reenviado.
        </p>
      </div>
    );
  }

  if (pendentes.length === 0) {
    return (
      <div className="border-border bg-surface text-fg-muted rounded-xl border px-6 py-10 text-center">
        <p className="text-fg font-medium">Você já respondeu tudo.</p>
        <p className="mt-1 text-sm">
          Precisando ajustar algum preço, fale com o comprador.
        </p>
      </div>
    );
  }

  // Agrupa por grupo da rodada, como o documento mestre pede: um link só, com
  // os produtos organizados.
  const grupos = new Map<string, PublicQuotationItem[]>();
  for (const item of pendentes) {
    const lista = grupos.get(item.group) ?? [];
    lista.push(item);
    grupos.set(item.group, lista);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />

      {[...grupos.entries()].map(([grupo, itensDoGrupo]) => (
        <section key={grupo} className="flex flex-col gap-3">
          <h2 className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
            {grupo}
          </h2>
          {itensDoGrupo.map((item) => (
            <ItemCard key={item.supplier_quotation_item_id} item={item} />
          ))}
        </section>
      ))}

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="border-border bg-surface sticky bottom-0 flex flex-col gap-2 border-t py-4">
        <SubmitButton count={pendentes.length} />
        <p className="text-fg-subtle text-center text-xs">
          Confira antes de enviar: cada item só pode ser respondido uma vez.
        </p>
      </div>
    </form>
  );
}
