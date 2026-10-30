import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuBadge,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

/**
 * Abas de recorte com contagem: "Todas 24 · Em aberto 7 · Aguardando 3".
 *
 * Ficam no lugar da fileira de cartões de indicador que abria cada lista. Os
 * cartões custavam ~110px antes da primeira linha e repetiam números que o
 * filtro e a tabela já diziam; aqui o número É o filtro — um clique e a lista
 * mostra exatamente aquilo que foi contado.
 *
 * As contagens vêm do recorte SEM a situação (mas com busca e datas): senão,
 * escolher "Concluídas" zeraria todas as outras abas.
 *
 * Abaixo de `lg` elas viram um menu: um botão com a aba atual e a contagem, que
 * abre com as outras. Uma faixa que rola de lado esconde abas (e a contagem
 * delas) onde o dedo não tem como descobri-las, e pílulas empilhadas comem
 * três linhas da tela. De `lg` para cima, onde com a barra lateral as abas
 * cabem, são abas sublinhadas.
 */
export type Segmento = {
  /** Valor do parâmetro; `null` é "todas". */
  valor: string | null;
  rotulo: string;
  contagem: number;
};

export function ListSegments({
  basePath,
  param,
  atual,
  segmentos,
  params,
}: {
  basePath: string;
  param: string;
  atual: string | null;
  segmentos: Segmento[];
  /** O recorte da página, para as abas preservarem busca e datas. */
  params: Record<string, string | string[] | undefined>;
}) {
  function href(valor: string | null) {
    const busca = new URLSearchParams();
    for (const [chave, bruto] of Object.entries(params)) {
      if (chave === param || chave === "pagina" || bruto === undefined)
        continue;
      busca.set(chave, Array.isArray(bruto) ? bruto[0] : bruto);
    }
    if (valor) busca.set(param, valor);
    const query = busca.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  const atualSegmento =
    segmentos.find((segmento) => segmento.valor === atual) ?? segmentos[0];

  return (
    <>
      <nav aria-label="Situação" className="mb-4 shrink-0 lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="border-input bg-input-bg text-fg focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium shadow-xs outline-none focus-visible:ring-3"
            >
              <span className="min-w-0 flex-1 truncate">
                {atualSegmento.rotulo}
              </span>
              <span className="bg-primary-soft text-primary rounded-sm px-1.5 text-xs tabular-nums">
                {atualSegmento.contagem}
              </span>
              <ChevronDown
                className="text-fg-subtle size-4 shrink-0"
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width)"
          >
            {segmentos.map((segmento) => {
              const ativo = segmento.valor === atualSegmento.valor;
              return (
                <DropdownMenuItem
                  key={segmento.valor ?? "todas"}
                  asChild
                  className="min-h-11"
                >
                  <Link
                    href={href(segmento.valor)}
                    scroll={false}
                    aria-current={ativo ? "page" : undefined}
                  >
                    <span className={ativo ? "font-medium" : undefined}>
                      {segmento.rotulo}
                    </span>
                    {ativo ? (
                      <Check className="text-primary" aria-hidden />
                    ) : null}
                    <DropdownMenuBadge>{segmento.contagem}</DropdownMenuBadge>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <nav
        aria-label="Situação"
        className="border-border mb-4 hidden shrink-0 gap-1 overflow-x-auto border-b lg:flex"
      >
        {segmentos.map((segmento) => {
          const ativo = segmento.valor === atual;
          return (
            <Link
              key={segmento.valor ?? "todas"}
              href={href(segmento.valor)}
              scroll={false}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                "pointer-coarse:py-3",
                ativo
                  ? "border-primary text-fg font-medium"
                  : "text-fg-muted hover:text-fg border-transparent",
              )}
            >
              {segmento.rotulo}
              <span
                className={cn(
                  "rounded-sm px-1.5 text-xs tabular-nums",
                  ativo
                    ? "bg-primary-soft text-primary"
                    : "bg-surface-muted text-fg-subtle",
                )}
              >
                {segmento.contagem}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
