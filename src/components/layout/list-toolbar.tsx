"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * O alto de uma lista: busca sempre à vista e o recorte que está valendo, em
 * etiquetas que se desfazem com um clique.
 *
 * A busca morava dentro do modal de filtros: abrir, digitar, Aplicar, e só
 * então ler o resultado — para a ação mais comum da tela. Agora ela filtra
 * enquanto se digita (com espera) e o `/` leva o foco até ela de qualquer
 * ponto da página. O resto dos filtros continua no modal, porque é ocasional;
 * o que ele recortou aparece aqui, nomeado, em vez de virar um número no botão.
 *
 * São dois componentes porque moram em lugares diferentes da página: a busca
 * fica FORA da fronteira de espera que troca a cada recorte (dentro dela, cada
 * letra desmontaria o campo e levaria o foco embora); as etiquetas ficam
 * DENTRO, junto da consulta que sabe dar nome ao que foi filtrado.
 */

const ESPERA_MS = 300;

export type FiltroAtivo = {
  /** Como o recorte se lê: "Situação: Em aberto". */
  rotulo: string;
  /** Parâmetros da URL que o compõem e saem juntos no ×. */
  chaves: string[];
};

function semChaves(
  basePath: string,
  atual: URLSearchParams,
  chaves: string[],
) {
  const busca = new URLSearchParams(atual);
  for (const chave of [...chaves, "pagina"]) busca.delete(chave);
  const query = busca.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Campo de busca da lista, ligado ao `?busca=` da URL (ou a outro parâmetro). */
export function ListSearch({
  placeholder,
  param = "busca",
  numerico = false,
  className,
}: {
  placeholder: string;
  /** Pedidos buscam pelo número (`?numero=`), que é o que o banco filtra. */
  param?: string;
  numerico?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const termoNaUrl = params.get(param) ?? "";
  const [termo, setTermo] = React.useState(termoNaUrl);

  // Voltar e avançar no navegador trocam a URL por fora: o campo acompanha.
  const [urlAnterior, setUrlAnterior] = React.useState(termoNaUrl);
  if (urlAnterior !== termoNaUrl) {
    setUrlAnterior(termoNaUrl);
    setTermo(termoNaUrl);
  }

  React.useEffect(() => {
    const limpo = termo.trim();
    if (limpo === termoNaUrl.trim()) return;
    const timer = window.setTimeout(() => {
      const busca = new URLSearchParams(params);
      busca.delete("pagina");
      if (limpo) busca.set(param, limpo);
      else busca.delete(param);
      const query = busca.toString();
      // `replace`: cada letra não vira uma entrada no histórico.
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }, ESPERA_MS);
    return () => window.clearTimeout(timer);
  }, [termo, termoNaUrl, params, pathname, router, param]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search
        className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        type="search"
        inputMode={numerico ? "numeric" : undefined}
        data-page-search
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && termo) {
            e.preventDefault();
            setTermo("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "border-input bg-input-bg text-fg placeholder:text-fg-subtle h-8 w-full rounded-md border pr-8 pl-8 text-sm shadow-xs outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
          "pointer-coarse:h-11 pointer-coarse:text-base [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {termo ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => setTermo("")}
          className="text-fg-subtle hover:text-fg absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-sm"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : (
        <kbd className="border-border text-fg-subtle pointer-events-none absolute top-1/2 right-2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-sm border px-1 font-sans text-xs sm:inline-flex pointer-coarse:hidden">
          /
        </kbd>
      )}
    </div>
  );
}

/** O recorte em etiquetas; cada × tira só aquele filtro. */
export function FilterChips({
  filtros,
  className,
}: {
  filtros: FiltroAtivo[];
  className?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (filtros.length === 0) return null;

  return (
    <div className={cn("mb-3 flex shrink-0 flex-wrap items-center gap-2", className)}>
      {filtros.map((filtro) => (
        <Link
          key={filtro.rotulo}
          href={semChaves(pathname, params, filtro.chaves)}
          scroll={false}
          aria-label={`Remover filtro ${filtro.rotulo}`}
          className={cn(
            "border-primary-line bg-primary-soft text-fg inline-flex h-7 items-center gap-1.5 rounded-md border pr-2 pl-2.5 text-sm transition-colors",
            "hover:border-primary pointer-coarse:h-10",
          )}
        >
          {filtro.rotulo}
          <X className="text-fg-muted size-3.5" aria-hidden />
        </Link>
      ))}
      {filtros.length > 1 ? (
        <Link
          href={semChaves(
            pathname,
            params,
            filtros.flatMap((f) => f.chaves),
          )}
          scroll={false}
          className="text-fg-muted hover:text-fg px-1 text-sm underline-offset-4 hover:underline"
        >
          Limpar filtros
        </Link>
      ) : null}
    </div>
  );
}
