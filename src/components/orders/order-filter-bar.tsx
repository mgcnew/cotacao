import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  SITUACOES_COMPOSTAS,
  type OrderFilters,
} from "@/features/orders/filters";
import { ORDER_STATUS_LABEL } from "@/features/orders/queries";

/**
 * Os campos do recorte da lista de pedidos.
 *
 * São só os campos: o `<form>`, o "Aplicar" e o "Limpar" moram no
 * `FilterDialog`. Sem estado próprio, eles continuam sendo componente de
 * servidor — inclusive a lista de fornecedores, que pode ser longa e não
 * precisa virar JavaScript no navegador.
 */
export function OrderFilterFields({
  filters,
  suppliers,
}: {
  filters: OrderFilters;
  suppliers: { id: string; name: string }[];
}) {
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
            ...Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fornecedor" className="text-fg-muted text-xs">
          Fornecedor
        </label>
        <SearchableSelect
          id="fornecedor"
          name="fornecedor"
          defaultValue={filters.fornecedorId ?? ""}
          options={suppliers}
          placeholder="Digite o fornecedor…"
          emptyMessage="Nenhum fornecedor encontrado."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="de" className="text-fg-muted text-xs">
          Pedidos de
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
  );
}
