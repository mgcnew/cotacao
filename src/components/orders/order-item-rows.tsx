"use client";

import { AlertCircle, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

export type OrderableProduct = {
  id: string;
  name: string;
  purchaseUnit: string;
  pricingUnit: string;
};

/** Linha já existente no pedido, ou linha em branco esperando ser preenchida. */
export type ItemSeed = {
  /** Id do `order_revision_item`, quando a linha já existe no banco. */
  itemId?: string;
  /** Alocação que originou o item; viaja junto para não se perder na revisão. */
  allocationId?: string | null;
  productId: string;
  productName?: string;
  quantity: string;
  price: string;
  notes: string;
};

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {error}
    </p>
  );
}

export function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export const NUMERO = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

/** Número do banco no formato que a pessoa digita e reconhece. */
export function paraCampo(valor: number, casas = 2): string {
  return valor.toFixed(casas).replace(".", ",");
}

type Row = ItemSeed & { key: number };

/**
 * Os itens de um pedido, em linhas que se acrescentam e se removem.
 *
 * Os campos são não controlados de propósito: a lista de linhas é estado, o
 * conteúdo delas não. Assim, remover uma linha não faz as outras perderem o
 * que já tinha sido digitado — o React mantém os nós pela `key`, e o valor
 * digitado continua onde estava.
 *
 * A linha de um item que já existe no banco não deixa trocar o produto: trocar
 * seria outro item, não uma correção. Para isso, remove-se e acrescenta-se.
 */
export function OrderItemRows({
  products,
  seeds,
}: {
  products: OrderableProduct[];
  seeds: ItemSeed[];
}) {
  const proximaChave = React.useRef(seeds.length);
  const [rows, setRows] = React.useState<Row[]>(() =>
    seeds.map((seed, index) => ({ ...seed, key: index })),
  );

  const unidadesDe = (row: Row) => products.find((p) => p.id === row.productId);

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const unidades = unidadesDe(row);
        return (
          <div
            key={row.key}
            className="border-border flex flex-col gap-2 rounded-lg border p-3"
          >
            {row.itemId ? (
              <input type="hidden" name="itemId" value={row.itemId} />
            ) : (
              // O array de itens precisa ficar alinhado com o de produtos: uma
              // linha nova mandaria um campo a menos e desalinharia o resto.
              <input type="hidden" name="itemId" value="" />
            )}
            <input
              type="hidden"
              name="allocationId"
              value={row.allocationId ?? ""}
            />

            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`produto-${row.key}`}
                  className="text-fg-muted text-xs"
                >
                  Produto
                </label>
                {row.itemId ? (
                  <>
                    <input type="hidden" name="productId" value={row.productId} />
                    <p
                      id={`produto-${row.key}`}
                      className="text-fg flex h-8 items-center text-sm"
                    >
                      {row.productName}
                    </p>
                  </>
                ) : (
                  <select
                    id={`produto-${row.key}`}
                    name="productId"
                    required
                    className={selectClass}
                    value={row.productId}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, productId: e.target.value }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="">Selecione…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`qtd-${row.key}`} className="text-fg-muted text-xs">
                  Quantidade{unidades ? ` (${unidades.purchaseUnit})` : ""}
                </label>
                <Input
                  id={`qtd-${row.key}`}
                  name="quantity"
                  required
                  inputMode="decimal"
                  defaultValue={row.quantity}
                  className="h-8"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`preco-${row.key}`}
                  className="text-fg-muted text-xs"
                >
                  Preço{unidades ? ` (por ${unidades.pricingUnit})` : ""}
                </label>
                <Input
                  id={`preco-${row.key}`}
                  name="price"
                  required
                  inputMode="decimal"
                  defaultValue={row.price}
                  className="h-8"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                name="itemNotes"
                maxLength={200}
                defaultValue={row.notes}
                placeholder="Observação do item (opcional)"
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-fg-subtle shrink-0"
                aria-label="Remover item"
                disabled={rows.length === 1}
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.key !== row.key))
                }
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}

      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                key: proximaChave.current++,
                productId: "",
                quantity: "",
                price: "",
                notes: "",
              },
            ])
          }
        >
          <Plus className="size-3.5" aria-hidden /> Adicionar item
        </Button>
      </div>
    </div>
  );
}
