import { Input } from "@/components/ui/input";
import {
  SITUACOES_COMPOSTAS,
  type RoundFilters,
} from "@/features/rounds/filters";
import { ROUND_STATUS_LABEL } from "@/features/rounds/status";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

/**
 * Os campos do recorte da lista de rodadas.
 *
 * São só os campos: o `<form>`, o "Aplicar" e o "Limpar" moram no
 * `FilterDialog`, que é quem sabe para onde levar. Assim estes campos
 * continuam sendo componente de servidor — eles não têm estado nenhum, e o
 * navegador não precisa recebê-los como JavaScript.
 */
export function RoundFilterFields({ filters }: { filters: RoundFilters }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
  );
}
