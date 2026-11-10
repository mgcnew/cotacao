import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  SITUACOES_COMPOSTAS,
  type RoundFilters,
} from "@/features/rounds/filters";
import { ROUND_STATUS_LABEL } from "@/features/rounds/status";

/**
 * Os campos do recorte da lista de rodadas.
 *
 * São só os campos: o `<form>`, o "Aplicar" e o "Limpar" moram no
 * `FilterDialog`, que é quem sabe para onde levar. Assim estes campos
 * continuam sendo componente de servidor — eles não têm estado nenhum, e o
 * navegador não precisa recebê-los como JavaScript.
 *
 * Situação e datas usam os controles do sistema, não os nativos do navegador:
 * o calendário e a lista do navegador ignoram o tema escolhido no app.
 */
export function RoundFilterFields({ filters }: { filters: RoundFilters }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="situacao" className="text-fg-muted text-xs">
          Situação
        </label>
        <ThemedSelect
          id="situacao"
          name="situacao"
          defaultValue={filters.situacao ?? ""}
          placeholder="Todas"
          emptyOptionLabel="Todas"
          options={[
            ...Object.entries(SITUACOES_COMPOSTAS).map(([value, label]) => ({
              value,
              label,
            })),
            ...Object.entries(ROUND_STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="de" className="text-fg-muted text-xs">
          Criadas de
        </label>
        <DateTimePicker
          id="de"
          name="de"
          defaultValue={filters.de ?? ""}
          placeholder="Escolher data inicial"
          dateOnly
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ate" className="text-fg-muted text-xs">
          Até
        </label>
        <DateTimePicker
          id="ate"
          name="ate"
          defaultValue={filters.ate ?? ""}
          placeholder="Escolher data final"
          dateOnly
        />
      </div>
    </div>
  );
}
