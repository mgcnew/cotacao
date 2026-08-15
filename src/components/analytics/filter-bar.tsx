import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyticsFilters } from "@/features/analytics/filters";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

type Opcao = { id: string; name: string };

/**
 * Filtros globais.
 *
 * Formulário GET puro, sem JavaScript: o recorte vira query string, então dá
 * para compartilhar o link, recarregar e voltar pelo histórico do navegador.
 * Um componente de servidor — não há estado a manter.
 */
export function FilterBar({
  filters,
  options,
}: {
  filters: AnalyticsFilters;
  options: {
    categorias: Opcao[];
    produtos: Opcao[];
    fornecedores: Opcao[];
  };
}) {
  return (
    <form
      method="get"
      className="border-border bg-surface mb-6 flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="de" className="text-fg-muted text-xs">
            De
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
          <label htmlFor="categoria" className="text-fg-muted text-xs">
            Categoria
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={filters.categoriaId ?? ""}
            className={selectClass}
          >
            <option value="">Todas</option>
            {options.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="produto" className="text-fg-muted text-xs">
            Produto
          </label>
          <select
            id="produto"
            name="produto"
            defaultValue={filters.produtoId ?? ""}
            className={selectClass}
          >
            <option value="">Todos</option>
            {options.produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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
            {options.fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg-subtle text-xs">
          O recorte fica no endereço da página — dá para salvar e compartilhar.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/analises">Limpar</Link>
          </Button>
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </div>
      </div>
    </form>
  );
}
