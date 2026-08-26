import { CalendarRange, Filter, Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { AnalyticsFilters } from "@/features/analytics/filters";

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
  const active = [
    filters.de
      ? {
          key: "de",
          label: `Desde ${filters.de.split("-").reverse().join("/")}`,
        }
      : null,
    filters.ate
      ? {
          key: "ate",
          label: `Até ${filters.ate.split("-").reverse().join("/")}`,
        }
      : null,
    filters.categoriaId
      ? {
          key: "categoria",
          label: `Categoria: ${options.categorias.find((item) => item.id === filters.categoriaId)?.name ?? "selecionada"}`,
        }
      : null,
    filters.produtoId
      ? {
          key: "produto",
          label: `Produto: ${options.produtos.find((item) => item.id === filters.produtoId)?.name ?? "selecionado"}`,
        }
      : null,
    filters.fornecedorId
      ? {
          key: "fornecedor",
          label: `Fornecedor: ${options.fornecedores.find((item) => item.id === filters.fornecedorId)?.name ?? "selecionado"}`,
        }
      : null,
    filters.resultadoFinanceiro
      ? {
          key: "resultado_financeiro",
          label:
            FINANCIAL_OPTIONS.find(
              (item) => item.value === filters.resultadoFinanceiro,
            )?.label ?? "Resultado financeiro",
        }
      : null,
    filters.resultadoCotacao
      ? {
          key: "resultado_cotacao",
          label:
            QUOTATION_OPTIONS.find(
              (item) => item.value === filters.resultadoCotacao,
            )?.label ?? "Resultado da cotação",
        }
      : null,
  ].filter((item): item is { key: string; label: string } => item !== null);

  const presets = [
    { label: "Este mês", de: `${today.slice(0, 7)}-01`, ate: today },
    { label: "30 dias", de: daysBefore(today, 29), ate: today },
    { label: "90 dias", de: daysBefore(today, 89), ate: today },
    { label: "Este ano", de: `${today.slice(0, 4)}-01-01`, ate: today },
  ];

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog key={paramsFromFilters(filters).toString()}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              <Filter aria-hidden /> Filtros
              {active.length ? (
                <span className="bg-primary text-primary-fg ml-1 grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-5">
                  {active.length}
                </span>
              ) : null}
            </Button>
          </DialogTrigger>

          <DialogContent size="lg">
            <form method="get" className="contents">
              <DialogHeader>
                <DialogTitle>Filtros de aferição</DialogTitle>
                <DialogDescription>
                  Cruze período, produto, fornecedor e resultados para
                  investigar os indicadores da página.
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="flex flex-col gap-5">
                <section>
                  <p className="text-fg-muted mb-2 flex items-center gap-1.5 text-xs font-medium">
                    <CalendarRange className="size-3.5" aria-hidden /> Períodos
                    rápidos
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <Link
                        key={preset.label}
                        href={hrefChanging(filters, {
                          de: preset.de,
                          ate: preset.ate,
                        })}
                        className="border-border bg-surface-sunken text-fg-muted hover:border-ring hover:text-fg rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                      >
                        {preset.label}
                      </Link>
                    ))}
                  </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="De" htmlFor="de">
                    <Input
                      id="de"
                      name="de"
                      type="date"
                      defaultValue={filters.de ?? ""}
                      className="h-8"
                    />
                  </Field>
                  <Field label="Até" htmlFor="ate">
                    <Input
                      id="ate"
                      name="ate"
                      type="date"
                      defaultValue={filters.ate ?? ""}
                      className="h-8"
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
                </div>

                <div className="bg-surface-sunken grid gap-3 rounded-xl p-3 sm:grid-cols-2">
                  <Field
                    label="Resultado financeiro"
                    htmlFor="resultado-financeiro"
                  >
                    <ThemedSelect
                      id="resultado-financeiro"
                      name="resultado_financeiro"
                      options={FINANCIAL_OPTIONS}
                      defaultValue={filters.resultadoFinanceiro ?? ""}
                      emptyOptionLabel="Todos os resultados"
                    />
                  </Field>
                  <Field
                    label="Resultado da cotação"
                    htmlFor="resultado-cotacao"
                  >
                    <ThemedSelect
                      id="resultado-cotacao"
                      name="resultado_cotacao"
                      options={QUOTATION_OPTIONS}
                      defaultValue={filters.resultadoCotacao ?? ""}
                      emptyOptionLabel="Todos os resultados"
                    />
                  </Field>
                  <p className="text-fg-subtle text-[11px] leading-relaxed sm:col-span-2">
                    Resultado financeiro afeta os cards e o detalhamento de
                    preços. Resultado da cotação afeta a análise de
                    fornecedores.
                  </p>
                </div>

                <p className="text-fg-subtle flex items-start gap-1.5 text-xs">
                  <Search className="mt-0.5 size-3.5 shrink-0" aria-hidden /> O
                  período usa a chegada nos valores e a criação da rodada nos
                  indicadores de fornecedores. O recorte permanece no endereço e
                  pode ser salvo ou compartilhado.
                </p>
              </DialogBody>

              <DialogFooter className="justify-between">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/analises">Limpar tudo</Link>
                </Button>
                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <Button type="button" size="sm" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" size="sm">
                    Aplicar filtros
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {active.length === 0 ? (
          <p className="text-fg-subtle text-xs">Nenhum filtro aplicado.</p>
        ) : null}
      </div>

      {active.length ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtros ativos">
          {active.map((item) => (
            <Link
              key={item.key}
              href={hrefChanging(filters, { [item.key]: null })}
              className="border-border bg-surface text-fg-muted hover:border-destructive/50 hover:text-destructive inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
              title={`Remover ${item.label}`}
            >
              <span className="truncate">{item.label}</span>
              <X className="size-3 shrink-0" aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}
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
      <label htmlFor={htmlFor} className="text-fg-muted text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
