import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SITUACOES_COMPOSTAS,
  type OrderFilters,
} from "@/features/orders/filters";
import { ORDER_STATUS_LABEL } from "@/features/orders/queries";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

/**
 * Recorte da lista de pedidos.
 *
 * GET puro, sem JavaScript, como o das Análises: o filtro vira endereço, e o
 * endereço volta igual amanhã.
 */
export function OrderFilterBar({
  filters,
  suppliers,
}: {
  filters: OrderFilters;
  suppliers: { id: string; name: string }[];
}) {
  return (
    <form
      method="get"
      className="border-border bg-surface mb-6 flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="situacao" className="text-fg-muted text-xs">
            Situação
          </label>
          <select
            id="situacao"
            name="situacao"
            defaultValue={filters.situacao ?? ""}
            className={selectClass}
          >
            <option value="">Todas</option>
            {Object.entries(SITUACOES_COMPOSTAS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fornecedor" className="text-fg-muted text-xs">
            Fornecedor
          </label>
          <select
            id="fornecedor"
            name="fornecedor"
            defaultValue={filters.fornecedorId ?? ""}
            className={selectClass}
          >
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="de" className="text-fg-muted text-xs">
            Pedidos de
          </label>
          <Input
            id="de"
            name="de"
            type="date"
            defaultValue={filters.de ?? ""}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ate" className="text-fg-muted text-xs">
            Até
          </label>
          <Input
            id="ate"
            name="ate"
            type="date"
            defaultValue={filters.ate ?? ""}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="numero" className="text-fg-muted text-xs">
            Nº do pedido
          </label>
          <Input
            id="numero"
            name="numero"
            inputMode="numeric"
            placeholder="12"
            defaultValue={filters.numero ?? ""}
            className="h-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg-subtle text-xs">
          &quot;Em aberto&quot; é tudo que ainda não foi recebido nem cancelado.
          &quot;Atrasados&quot; é prazo vencido com mercadoria por vir.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/pedidos">Limpar</Link>
          </Button>
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </div>
      </div>
    </form>
  );
}
