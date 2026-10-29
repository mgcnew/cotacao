"use client";

import {
  ArrowRight,
  Clock,
  Loader2,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { useVisibleNav } from "@/components/layout/nav-list";
import { searchCompany } from "@/features/search/actions";
import { SEARCH_KIND_LABEL, type SearchHit } from "@/features/search/kinds";
import { cn } from "@/lib/utils";

/**
 * Paleta de comandos (Ctrl+K) e os atalhos de teclado do app.
 *
 * Substitui a busca que morava na sidebar. Lá ela só encontrava registros e
 * ficava presa aos 224px do menu; aqui, no meio da tela, ela também leva a
 * qualquer seção e dispara as ações de todo dia ("Nova rodada"), e lembra o
 * que foi aberto por último — o comprador volta ao mesmo fornecedor várias
 * vezes por dia.
 *
 * Os atalhos de uma tecla moram aqui também, porque a paleta é quem os ensina:
 * `?` abre a lista, e cada linha da paleta mostra a tecla que a dispara.
 */

const ESPERA_MS = 220;
const CHAVE_RECENTES = "cotapro:recentes";
const MAX_RECENTES = 6;

/** `g` e depois a letra: o mesmo gesto do Gmail e do GitHub. */
const IR_PARA: Record<string, string> = {
  d: "/dashboard",
  l: "/lista-compras",
  c: "/compras",
  p: "/pedidos",
  r: "/recebimentos",
  o: "/produtos",
  f: "/fornecedores",
  w: "/whatsapp",
  a: "/analises",
};
const TECLA_DE = Object.fromEntries(
  Object.entries(IR_PARA).map(([tecla, href]) => [href, tecla]),
);

type Acao = { label: string; href: string; lista: string; icon: LucideIcon };

/** `n` numa lista abre o "novo" dela; na paleta, as mesmas ações por nome. */
const ACOES: Acao[] = [
  { label: "Nova rodada de compras", href: "/compras/nova", lista: "/compras", icon: Plus },
  { label: "Novo pedido", href: "/pedidos/novo", lista: "/pedidos", icon: Plus },
  { label: "Novo produto", href: "/produtos/novo", lista: "/produtos", icon: Plus },
  { label: "Novo fornecedor", href: "/fornecedores/novo", lista: "/fornecedores", icon: Plus },
];

const ATALHOS: Array<[string, string]> = [
  ["Ctrl K", "Buscar ou ir para qualquer lugar"],
  ["/", "Buscar na lista aberta"],
  ["n", "Novo item da lista aberta"],
  ["g d", "Central do dia"],
  ["g l", "Lista de compras"],
  ["g c", "Compras"],
  ["g p", "Pedidos"],
  ["g r", "Recebimentos"],
  ["g o", "Produtos"],
  ["g f", "Fornecedores"],
  ["g w", "WhatsApp"],
  ["g a", "Análises"],
  ["?", "Esta lista de atalhos"],
];

type Linha = {
  id: string;
  grupo: string;
  label: string;
  detalhe?: string | null;
  dica?: string;
  icon: LucideIcon;
  href: string;
  hit?: SearchHit;
};

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function lerRecentes(): SearchHit[] {
  try {
    const bruto = localStorage.getItem(CHAVE_RECENTES);
    return bruto ? (JSON.parse(bruto) as SearchHit[]) : [];
  } catch {
    return [];
  }
}

function guardarRecente(hit: SearchHit) {
  try {
    const lista = [hit, ...lerRecentes().filter((h) => h.key !== hit.key)];
    localStorage.setItem(
      CHAVE_RECENTES,
      JSON.stringify(lista.slice(0, MAX_RECENTES)),
    );
  } catch {
    // Sem armazenamento a paleta funciona igual, só não lembra.
  }
}

/** Digitando num campo, as teclas são do campo, não dos atalhos. */
function digitando(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return false;
  return (
    alvo.isContentEditable ||
    alvo.closest("input, textarea, select, [role=combobox]") !== null
  );
}

export function CommandPalette({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { groups, footer } = useVisibleNav(permissions);
  const [aberta, setAberta] = React.useState(false);
  const [ajuda, setAjuda] = React.useState(false);

  // Teclas globais. `g` arma a sequência por um segundo e meio.
  React.useEffect(() => {
    let armado: number | null = null;
    function desarmar() {
      if (armado !== null) window.clearTimeout(armado);
      armado = null;
    }

    function aoTeclar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setAberta((v) => !v);
        return;
      }
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (digitando(evento.target)) return;
      // Com um modal aberto, as teclas pertencem a ele.
      if (document.querySelector("[role=dialog]")) return;

      if (armado !== null) {
        const destino = IR_PARA[evento.key.toLowerCase()];
        desarmar();
        if (destino) {
          evento.preventDefault();
          router.push(destino);
        }
        return;
      }

      if (evento.key === "g") {
        armado = window.setTimeout(desarmar, 1500);
      } else if (evento.key === "?") {
        evento.preventDefault();
        setAjuda(true);
      } else if (evento.key === "/") {
        evento.preventDefault();
        const campo = document.querySelector<HTMLInputElement>(
          "[data-page-search]",
        );
        if (campo) campo.focus();
        else setAberta(true);
      } else if (evento.key === "n") {
        const acao = ACOES.find((a) => a.lista === pathname);
        if (acao) {
          evento.preventDefault();
          router.push(acao.href);
        }
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => {
      desarmar();
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [router, pathname]);

  const destinos = React.useMemo(
    () => [...groups.flatMap((g) => g.items), ...footer],
    [groups, footer],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Buscar ou ir para (Ctrl K)"
        className={cn(
          "text-fg-subtle hover:text-fg-muted transition-colors duration-(--dur)",
          "grid size-8 place-items-center rounded-md md:hidden",
          "pointer-coarse:size-11",
        )}
      >
        <Search className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={cn(
          "border-border bg-surface-sunken text-fg-subtle hover:border-border-strong hover:text-fg-muted",
          "hidden h-8 w-64 items-center gap-2 rounded-md border px-2.5 text-sm shadow-xs transition-colors duration-(--dur) md:flex lg:w-80",
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Buscar ou ir para…</span>
        <Tecla>Ctrl K</Tecla>
      </button>

      <DialogPrimitive.Root open={aberta} onOpenChange={setAberta}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-ds-fade data-[state=closed]:animate-ds-fade-out fixed inset-0 z-50 bg-black/30" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              "border-border bg-surface-elevated fixed top-[12vh] left-1/2 z-50 w-[640px] max-w-[calc(100vw-1.5rem)] -translate-x-1/2",
              "overflow-hidden rounded-xl border shadow-(--shadow-md) outline-none",
              "data-[state=open]:animate-ds-in data-[state=closed]:animate-ds-out",
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              Buscar ou ir para
            </DialogPrimitive.Title>
            {/* Montada só aberta: cada abertura começa do zero. */}
            {aberta ? (
              <Paleta
                destinos={destinos}
                aoEscolher={(linha) => {
                  if (linha.hit) guardarRecente(linha.hit);
                  setAberta(false);
                  router.push(linha.href);
                }}
                aoPedirAjuda={() => {
                  setAberta(false);
                  setAjuda(true);
                }}
              />
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={ajuda} onOpenChange={setAjuda}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-ds-fade data-[state=closed]:animate-ds-fade-out fixed inset-0 z-50 bg-black/30" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              "border-border bg-surface-elevated fixed top-1/2 left-1/2 z-50 w-[420px] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2",
              "rounded-xl border p-5 shadow-(--shadow-md) outline-none",
              "data-[state=open]:animate-ds-dialog-in data-[state=closed]:animate-ds-dialog-out",
            )}
          >
            <DialogPrimitive.Title className="text-fg text-base font-semibold">
              Atalhos de teclado
            </DialogPrimitive.Title>
            <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
              {ATALHOS.map(([tecla, oQue]) => (
                <React.Fragment key={tecla}>
                  <dt className="flex gap-1">
                    {tecla.split(" ").map((t, i) => (
                      <Tecla key={i}>{t}</Tecla>
                    ))}
                  </dt>
                  <dd className="text-fg-muted">{oQue}</dd>
                </React.Fragment>
              ))}
            </dl>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function Paleta({
  destinos,
  aoEscolher,
  aoPedirAjuda,
}: {
  destinos: Array<{ href: string; label: string; icon: LucideIcon }>;
  aoEscolher: (linha: Linha) => void;
  aoPedirAjuda: () => void;
}) {
  const id = React.useId();
  const [termo, setTermo] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [termoBuscado, setTermoBuscado] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const [recentes] = React.useState(lerRecentes);
  const pedido = React.useRef(0);
  const listaRef = React.useRef<HTMLUListElement>(null);

  const limpo = termo.trim();

  // Mesma busca da antiga barra lateral: espera a digitação parar e descarta
  // a resposta que chega depois de uma mais nova.
  React.useEffect(() => {
    if (limpo.length === 0) return;
    const meu = ++pedido.current;
    const timer = window.setTimeout(async () => {
      const encontrados = await searchCompany(limpo);
      if (meu !== pedido.current) return;
      setHits(encontrados);
      setTermoBuscado(limpo);
      setAtivo(0);
    }, ESPERA_MS);
    return () => window.clearTimeout(timer);
  }, [limpo]);

  const linhas = React.useMemo<Linha[]>(() => {
    const filtro = normalizar(limpo);
    const casa = (texto: string) => !filtro || normalizar(texto).includes(filtro);
    const doHit = (grupo: string) => (hit: SearchHit): Linha => ({
      id: `${grupo}-${hit.key}`,
      grupo,
      label: hit.title,
      detalhe: hit.subtitle,
      dica: SEARCH_KIND_LABEL[hit.kind],
      icon: grupo === "Recentes" ? Clock : ArrowRight,
      href: hit.href,
      hit,
    });

    const acoes = ACOES.filter((a) => casa(a.label)).map<Linha>((a) => ({
      id: `acao-${a.href}`,
      grupo: "Ações",
      label: a.label,
      icon: a.icon,
      href: a.href,
    }));
    const ir = destinos
      .filter((d) => casa(d.label))
      .map<Linha>((d) => ({
        id: `ir-${d.href}`,
        grupo: "Ir para",
        label: d.label,
        icon: d.icon,
        href: d.href,
        dica: TECLA_DE[d.href] ? `g ${TECLA_DE[d.href]}` : undefined,
      }));

    if (!filtro) {
      return [...recentes.map(doHit("Recentes")), ...acoes, ...ir];
    }
    const resultados = termoBuscado === limpo ? hits.map(doHit("Resultados")) : [];
    return [...resultados, ...acoes, ...ir];
  }, [limpo, destinos, recentes, hits, termoBuscado]);

  const buscando = limpo.length > 0 && termoBuscado !== limpo;
  const indice = Math.min(ativo, Math.max(linhas.length - 1, 0));
  const escolhida = linhas[indice];

  React.useEffect(() => {
    if (!escolhida) return;
    listaRef.current
      ?.querySelector(`[data-linha="${CSS.escape(escolhida.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [escolhida]);

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAtivo((indice + 1) % Math.max(linhas.length, 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setAtivo((indice - 1 + linhas.length) % Math.max(linhas.length, 1));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      if (escolhida) aoEscolher(escolhida);
    } else if (evento.key === "?" && limpo.length === 0) {
      evento.preventDefault();
      aoPedirAjuda();
    }
  }

  let grupoAnterior = "";

  return (
    <div className="flex max-h-[min(560px,76vh)] flex-col">
      <div className="border-border relative flex items-center border-b">
        <Search
          className="text-fg-subtle pointer-events-none absolute left-4 size-4"
          aria-hidden
        />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={escolhida ? `${id}-${escolhida.id}` : undefined}
          aria-label="Buscar fornecedores, produtos, pedidos e rodadas, ou ir para uma seção"
          placeholder="Buscar fornecedor, produto, pedido, rodada… ou ir para"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAtivo(0);
          }}
          onKeyDown={aoTeclar}
          className="text-fg placeholder:text-fg-subtle h-12 w-full bg-transparent pr-12 pl-11 text-[15px] outline-none"
        />
        {buscando ? (
          <Loader2
            className="text-fg-subtle absolute right-4 size-4 animate-spin"
            aria-hidden
          />
        ) : (
          <span className="absolute right-3">
            <Tecla>Esc</Tecla>
          </span>
        )}
      </div>

      <ul
        ref={listaRef}
        id={`${id}-lista`}
        role="listbox"
        aria-label="Sugestões"
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {linhas.map((linha, i) => {
          const cabecalho = linha.grupo !== grupoAnterior ? linha.grupo : null;
          grupoAnterior = linha.grupo;
          const Icone = linha.icon;
          return (
            <React.Fragment key={linha.id}>
              {cabecalho ? (
                <li
                  role="presentation"
                  className="text-fg-subtle px-2.5 pt-2.5 pb-1 text-xs font-medium"
                >
                  {cabecalho}
                </li>
              ) : null}
              <li
                id={`${id}-${linha.id}`}
                data-linha={linha.id}
                role="option"
                aria-selected={i === indice}
                onMouseMove={() => setAtivo(i)}
                onClick={() => aoEscolher(linha)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                  "pointer-coarse:py-3",
                  i === indice ? "bg-primary-soft text-fg" : "text-fg-muted",
                )}
              >
                <Icone
                  className={cn(
                    "size-4 shrink-0",
                    i === indice ? "text-primary" : "text-fg-subtle",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block truncate">{linha.label}</span>
                  {linha.detalhe ? (
                    <span className="text-fg-subtle block truncate text-xs">
                      {linha.detalhe}
                    </span>
                  ) : null}
                </span>
                {linha.dica ? (
                  linha.grupo === "Ir para" ? (
                    <span className="flex gap-1">
                      {linha.dica.split(" ").map((t, k) => (
                        <Tecla key={k}>{t}</Tecla>
                      ))}
                    </span>
                  ) : (
                    <span className="text-fg-subtle shrink-0 text-xs">
                      {linha.dica}
                    </span>
                  )
                ) : null}
              </li>
            </React.Fragment>
          );
        })}
        {linhas.length === 0 && !buscando ? (
          <li className="text-fg-muted px-3 py-6 text-center text-sm">
            Nada encontrado para “{limpo}”.
          </li>
        ) : null}
      </ul>

      <div className="border-border text-fg-subtle hidden items-center gap-4 border-t px-4 py-2 text-xs sm:flex">
        <span className="flex items-center gap-1">
          <Tecla>↑</Tecla>
          <Tecla>↓</Tecla> navegar
        </span>
        <span className="flex items-center gap-1">
          <Tecla>Enter</Tecla> abrir
        </span>
        <span className="flex items-center gap-1">
          <Tecla>?</Tecla> todos os atalhos
        </span>
      </div>
    </div>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border-border bg-surface text-fg-muted inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-sans text-xs font-medium shadow-xs">
      {children}
    </kbd>
  );
}
