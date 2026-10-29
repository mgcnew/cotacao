"use client";

import Link from "next/link";
import * as React from "react";

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
 * No celular as abas não cabem e rolam de lado: a ativa é trazida para a vista
 * ao montar, e a borda direita esmaece para dizer que há mais.
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

  const navRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [atual]);

  return (
    <nav
      ref={navRef}
      aria-label="Situação"
      className={cn(
        "border-border mb-4 flex shrink-0 gap-1 overflow-x-auto border-b",
        "max-sm:pr-8 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]",
      )}
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
  );
}
