import Link from "next/link";

import { FilterDialog } from "@/components/layout/filter-dialog";
import { FilterChips, type FiltroAtivo } from "@/components/layout/list-toolbar";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { AnalyticsFilters } from "@/features/analytics/filters";
import { cn } from "@/lib/utils";

type Opcao = { id: string; name: string };

const FINANCIAL_OPTIONS = [
  { value: "economia", label: "Somente com economia" },
  { value: "acrescimo", label: "Somente com acréscimo" },
  { value: "divergencia", label: "Com divergência na nota" },
  { value: "sem_alteracao", label: "Sem alteração de preço" },
  { value: "sem_referencia", label: "Sem preço cotado" },
];
const QUOTATION_OPTIONS = [
  { value: "won", label: "Ganhou" },
  { value: "lost", label: "Não ganhou" },
  { value: "no_response", label: "Não respondeu" },
  { value: "unavailable", label: "Não fornece" },
  { value: "closed_without_purchase", label: "Encerrado sem compra" },
  { value: "in_progress", label: "Em andamento" },
];

/** A tabela de preços pagina por conta própria; todo recorte novo volta ao começo. */
const PAGINA = "pagina_precos";

function paramsFromFilters(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters.de) params.set("de", filters.de);
  if (filters.ate) params.set("ate", filters.ate);
  if (filters.categoriaId) params.set("categoria", filters.categoriaId);
  if (filters.produtoId) params.set("produto", filters.produtoId);
  if (filters.fornecedorId) params.set("fornecedor", filters.fornecedorId);
  if (filters.resultadoFinanceiro) {
    params.set("resultado_financeiro", filters.resultadoFinanceiro);
  }
  if (filters.resultadoCotacao) {
    params.set("resultado_cotacao", filters.resultadoCotacao);
  }
  return params;
}

function hrefChanging(
  filters: AnalyticsFilters,
  changes: Record<string, string | null>,
) {
  const params = paramsFromFilters(filters);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `/analises?${query}` : "/analises";
}

function daysBefore(date: string, days: number) {
  const current = new Date(`${date}T12:00:00Z`);
  current.setUTCDate(current.getUTCDate() - days);
  return current.toISOString().slice(0, 10);
}

export function formatDay(date: string) {
  return date.split("-").reverse().join("/");
}

export function periodPresets(today: string) {
  return [
    { label: "Tudo", de: null, ate: null },
    { label: "Este mês", de: `${today.slice(0, 7)}-01`, ate: today },
    { label: "30 dias", de: daysBefore(today, 29), ate: today },
    { label: "90 dias", de: daysBefore(today, 89), ate: today },
    { label: "Este ano", de: `${today.slice(0, 4)}-01-01`, ate: today },
  ];
}

/**
 * O recorte da Central de Análises: o período à vista e o resto no modal.
 *
 * O período é o filtro que se troca toda hora, então os atalhos saíram de
 * dentro do modal para a barra. Lá dentro eles navegavam na hora e jogavam
 * fora o que já tinha sido preenchido nos outros campos. A data exata, os
 * cadastros e os resultados continuam no modal, que é o mesmo das listas.
 */
export function FilterBar({
  filters,
  options,
  today,
}: {
  filters: AnalyticsFilters;
  options: {
    categorias: Opcao[];
    produtos: Opcao[];
    fornecedores: Opcao[];
  };
  today: string;
}) {
  const presets = periodPresets(today);
  const presetAtivo = presets.find(
    (preset) => preset.de === filters.de && preset.ate === filters.ate,
  );

  const periodo =
    filters.de && filters.ate
      ? `${formatDay(filters.de)} a ${formatDay(filters.ate)}`
      : filters.de
        ? `desde ${formatDay(filters.de)}`
        : filters.ate
          ? `até ${formatDay(filters.ate)}`
          : null;
  const nome = (lista: Opcao[], id: string | null) =>
    lista.find((item) => item.id === id)?.name ?? "removido";

  // Cada etiqueta leva junto a página da tabela, para o × não cair numa página
  // que deixou de existir no recorte maior.
  const ativos: FiltroAtivo[] = [
    periodo && !presetAtivo
      ? { rotulo: `Período: ${periodo}`, chaves: ["de", "ate", PAGINA] }
      : null,
    filters.categoriaId
      ? {
          rotulo: `Categoria: ${nome(options.categorias, filters.categoriaId)}`,
          chaves: ["categoria", PAGINA],
        }
      : null,
    filters.produtoId
      ? {
          rotulo: `Produto: ${nome(options.produtos, filters.produtoId)}`,
          chaves: ["produto", PAGINA],
        }
      : null,
    filters.fornecedorId
      ? {
          rotulo: `Fornecedor: ${nome(options.fornecedores, filters.fornecedorId)}`,
          chaves: ["fornecedor", PAGINA],
        }
      : null,
    filters.resultadoFinanceiro
      ? {
          rotulo:
            FINANCIAL_OPTIONS.find(
              (item) => item.value === filters.resultadoFinanceiro,
            )?.label ?? "Resultado financeiro",
          chaves: ["resultado_financeiro", PAGINA],
        }
      : null,
    filters.resultadoCotacao
      ? {
          rotulo: `Cotação: ${
            QUOTATION_OPTIONS.find(
              (item) => item.value === filters.resultadoCotacao,
            )?.label ?? "resultado"
          }`,
          chaves: ["resultado_cotacao", PAGINA],
        }
      : null,
  ].filter((item): item is FiltroAtivo => item !== null);

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Período"
          className="border-border bg-surface-sunken grid w-full grid-cols-5 gap-0.5 rounded-md border p-0.5 sm:inline-flex sm:w-auto"
        >
          {presets.map((preset) => {
            const ativo = preset === presetAtivo;
            return (
              <Link
                key={preset.label}
                href={hrefChanging(filters, { de: preset.de, ate: preset.ate })}
                scroll={false}
                aria-current={ativo ? "true" : undefined}
                className={cn(
                  "text-fg-muted hover:text-fg focus-visible:ring-ring/50 flex h-7 items-center justify-center rounded-[5px] px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-3 pointer-coarse:h-10 sm:text-sm",
                  ativo && "bg-surface text-fg font-medium shadow-xs",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
        </nav>

        <FilterDialog
          basePath="/analises"
          ativos={ativos.length}
          paginaParam={PAGINA}
          ajuda={
            <>
              O período usa a chegada da mercadoria nos valores e a criação da
              rodada nos indicadores de fornecedores. Resultado financeiro
              recorta os números e a aferição de preços; resultado da cotação
              recorta o desempenho dos fornecedores.
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="De" htmlFor="de">
              <DateTimePicker
                id="de"
                name="de"
                defaultValue={filters.de ?? ""}
                placeholder="Data inicial"
                dateOnly
              />
            </Field>
            <Field label="Até" htmlFor="ate">
              <DateTimePicker
                id="ate"
                name="ate"
                defaultValue={filters.ate ?? ""}
                placeholder="Data final"
                dateOnly
              />
            </Field>
            <Field label="Categoria" htmlFor="categoria">
              <SearchableSelect
                id="categoria"
                name="categoria"
                options={options.categorias}
                defaultValue={filters.categoriaId ?? ""}
                placeholder="Buscar categoria…"
              />
            </Field>
            <Field label="Produto" htmlFor="produto">
              <SearchableSelect
                id="produto"
                name="produto"
                options={options.produtos}
                defaultValue={filters.produtoId ?? ""}
                placeholder="Buscar produto…"
              />
            </Field>
            <Field label="Fornecedor" htmlFor="fornecedor">
              <SearchableSelect
                id="fornecedor"
                name="fornecedor"
                options={options.fornecedores}
                defaultValue={filters.fornecedorId ?? ""}
                placeholder="Buscar fornecedor…"
              />
            </Field>
            <Field label="Resultado financeiro" htmlFor="resultado-financeiro">
              <ThemedSelect
                id="resultado-financeiro"
                name="resultado_financeiro"
                options={FINANCIAL_OPTIONS}
                defaultValue={filters.resultadoFinanceiro ?? ""}
                emptyOptionLabel="Todos os resultados"
              />
            </Field>
            <Field label="Resultado da cotação" htmlFor="resultado-cotacao">
              <ThemedSelect
                id="resultado-cotacao"
                name="resultado_cotacao"
                options={QUOTATION_OPTIONS}
                defaultValue={filters.resultadoCotacao ?? ""}
                emptyOptionLabel="Todos os resultados"
              />
            </Field>
          </div>
        </FilterDialog>
      </div>

      <FilterChips filtros={ativos} className="mt-3 mb-0" />
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-fg-muted text-xs">
        {label}
      </label>
      {children}
    </div>
  );
}
