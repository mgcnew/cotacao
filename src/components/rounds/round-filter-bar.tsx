import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SITUACOES_COMPOSTAS,
  type RoundFilters,
} from "@/features/rounds/filters";
import { ROUND_STATUS_LABEL } from "@/features/rounds/status";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

/** Recorte da lista de rodadas. GET puro, sem JavaScript. */
export function RoundFilterBar({ filters }: { filters: RoundFilters }) {
  return (
    <form
      method="get"
      className="border-border bg-surface mb-6 flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            {Object.entries(ROUND_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="busca" className="text-fg-muted text-xs">
            Título
          </label>
          <Input
            id="busca"
            name="busca"
            defaultValue={filters.busca ?? ""}
            placeholder="compra semanal"
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="de" className="text-fg-muted text-xs">
            Criadas de
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg-subtle text-xs">
          &quot;Em aberto&quot; é preparação e andamento juntos.
          &quot;Aguardando resposta&quot; é rodada ativa com fornecedor devendo
          preço.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/compras">Limpar</Link>
          </Button>
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </div>
      </div>
    </form>
  );
}
