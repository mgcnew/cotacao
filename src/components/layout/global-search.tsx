"use client";

import { Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { searchCompany } from "@/features/search/actions";
import {
  SEARCH_KIND_LABEL,
  type SearchHit,
} from "@/features/search/kinds";
import { cn } from "@/lib/utils";

/**
 * Espera a pessoa parar de digitar antes de perguntar ao servidor.
 *
 * 220 ms: acima disso a sugestão parece atrasada, abaixo disso digitar
 * "frigorífico" viraria onze consultas.
 */
const ESPERA_MS = 220;

/**
 * Busca global do menu.
 *
 * É só busca: não há filtro por tipo, nem abas, nem seções — a pessoa digita e
 * o que casa aparece. O tipo vai como etiqueta em cada linha, porque sem ela
 * "Compra teste" não diz se é uma rodada ou um produto, e o clique vira aposta.
 *
 * A acessibilidade segue o padrão combobox: o campo declara `role="combobox"`
 * com `aria-expanded` e `aria-controls`, a lista é uma `listbox` de `option`, e
 * `aria-activedescendant` diz qual está sob as setas — assim o leitor de tela
 * anuncia a sugestão mudando sem que o foco saia do campo.
 *
 * O resultado que chega fora de ordem é descartado pelo contador de pedidos:
 * digitar rápido dispara respostas que podem voltar trocadas, e a última
 * digitada é a única que interessa.
 */
export function GlobalSearch({
  collapsed = false,
  onExpand,
  onNavigate,
}: {
  collapsed?: boolean;
  /** Pedido para a sidebar se abrir: recolhida, o campo não existe no DOM. */
  onExpand?: () => void;
  /** Chamado ao abrir um resultado — no celular, é o que fecha a gaveta. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [termo, setTermo] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  /** Termo que produziu os `hits` atuais. */
  const [termoBuscado, setTermoBuscado] = React.useState("");
  const [aberto, setAberto] = React.useState(false);
  const [ativo, setAtivo] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const pedido = React.useRef(0);

  // Busca com espera, cancelando o que ficou pelo caminho. Todo setState mora
  // dentro do callback, e nenhum no corpo do efeito: chamar setState
  // sincronamente ali provoca render em cascata.
  React.useEffect(() => {
    const limpo = termo.trim();
    if (limpo.length === 0) return;

    const meu = ++pedido.current;
    const timer = window.setTimeout(async () => {
      const encontrados = await searchCompany(limpo);
      // Resposta velha chegando depois da nova: ignora.
      if (meu !== pedido.current) return;
      setHits(encontrados);
      setTermoBuscado(limpo);
      setAtivo(0);
    }, ESPERA_MS);

    return () => window.clearTimeout(timer);
  }, [termo]);

  // Clique fora fecha. Registrado no documento porque o alvo do clique está,
  // por definição, fora deste componente.
  React.useEffect(() => {
    if (!aberto) return;

    function aoClicar(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  /**
   * Leva o foco ao campo, expandindo a sidebar antes se for preciso.
   *
   * Recolhida, o `input` não está montado — então `focus()` cairia no vazio. O
   * quadro seguinte é onde ele já existe, e por isso o foco espera por ele.
   */
  const focarCampo = React.useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      return;
    }
    onExpand?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onExpand]);

  // Atalho de teclado para chegar ao campo sem o mouse.
  React.useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        focarCampo();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [focarCampo]);

  function abrir(hit: SearchHit) {
    setAberto(false);
    setTermo("");
    router.push(hit.href);
    // No celular a busca mora dentro da gaveta: navegar sem fechá-la deixaria a
    // pessoa olhando o menu em vez da tela que pediu.
    onNavigate?.();
  }

  function aoTeclarNoCampo(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Escape") {
      setAberto(false);
      return;
    }
    if (hits.length === 0) return;

    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAberto(true);
      setAtivo((i) => (i + 1) % hits.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setAberto(true);
      setAtivo((i) => (i - 1 + hits.length) % hits.length);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const escolhido = hits[ativo];
      if (escolhido) abrir(escolhido);
    }
  }

  const limpo = termo.trim();
  const temTermo = limpo.length > 0;
  // Derivado, não estado: está buscando enquanto o que se digitou ainda não é o
  // que produziu a lista.
  const buscando = temTermo && termoBuscado !== limpo;
  const mostrarLista = aberto && temTermo;
  const vazio = !buscando && hits.length === 0 && limpo.length >= 2;

  // Recolhida, a sidebar tem 56px e não cabe um campo. Sobra o ícone, que
  // expande o menu e leva o foco à busca — em vez de esconder a busca por
  // completo de quem trabalha com a sidebar fechada.
  if (collapsed) {
    return (
      <div className="px-2 pb-1">
        <button
          type="button"
          aria-label="Buscar"
          onClick={focarCampo}
          className="text-fg-subtle hover:bg-surface-muted hover:text-fg-muted grid h-9 w-full place-items-center rounded-md transition-colors duration-(--dur)"
        >
          <Search className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative px-2 pb-1">
      <div className="relative">
        <Search
          className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls="busca-sugestoes"
          aria-autocomplete="list"
          aria-activedescendant={
            mostrarLista && hits[ativo] ? `sugestao-${hits[ativo].key}` : undefined
          }
          aria-label="Buscar fornecedores, produtos, pedidos e rodadas"
          placeholder="Buscar…"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclarNoCampo}
          className={cn(
            "border-input bg-surface-sunken text-fg placeholder:text-fg-subtle",
            "focus-visible:border-ring focus-visible:ring-ring/50",
            "h-9 w-full rounded-md border pr-8 pl-8 text-sm outline-none focus-visible:ring-3",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />

        {buscando ? (
          <Loader2
            className="text-fg-subtle absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin"
            aria-hidden
          />
        ) : temTermo ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setTermo("");
              inputRef.current?.focus();
            }}
            className="text-fg-subtle hover:text-fg absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* A lista é sempre renderizada para o `aria-controls` do campo apontar
          para um elemento que existe; o que muda é ter ou não itens. */}
      <ul
        id="busca-sugestoes"
        role="listbox"
        aria-label="Sugestões"
        className={cn(
          "border-border bg-surface absolute z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border shadow-lg",
          // Mais larga que a sidebar de propósito: presa aos 224px dela, todo
          // nome de produto virava "Coxa com sobrec…". Como é um popover, passar
          // por cima do conteúdo é o comportamento esperado.
          "w-[calc(100%-1rem)] min-w-[18rem]",
          mostrarLista && (hits.length > 0 || vazio) ? "block" : "hidden",
        )}
      >
        {hits.map((hit, indice) => (
          <li key={hit.key}>
            <button
              type="button"
              id={`sugestao-${hit.key}`}
              role="option"
              aria-selected={indice === ativo}
              // O mouse move a seleção para onde o ponteiro está, senão teclado
              // e mouse discordariam sobre qual item está escolhido.
              onMouseEnter={() => setAtivo(indice)}
              onClick={() => abrir(hit)}
              className={cn(
                "flex w-full items-baseline gap-2 px-3 py-2 text-left",
                indice === ativo ? "bg-surface-muted" : "bg-transparent",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="text-fg block truncate text-sm">
                  {hit.title}
                </span>
                {hit.subtitle ? (
                  <span className="text-fg-subtle block truncate text-xs">
                    {hit.subtitle}
                  </span>
                ) : null}
              </span>
              <span className="text-fg-subtle shrink-0 text-[10px] tracking-wide uppercase">
                {SEARCH_KIND_LABEL[hit.kind]}
              </span>
            </button>
          </li>
        ))}

        {vazio ? (
          <li className="text-fg-muted px-3 py-3 text-sm">
            Nada encontrado para “{limpo}”.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
