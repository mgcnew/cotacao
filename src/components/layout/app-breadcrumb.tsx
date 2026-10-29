"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

import { FOOTER_NAV, NAV_GROUPS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

/**
 * Trilha do cabeçalho e memória do recorte de cada lista.
 *
 * O "Voltar" de um detalhe levava sempre à lista crua: quem abriu o pedido a
 * partir de "Atrasados, fornecedor X, página 3" voltava ao começo e refazia o
 * filtro. Agora a lista anota a própria URL (com a querystring) ao ser vista,
 * e todo link de volta para ela — a trilha e os botões "Voltar" — usa a anotação.
 * Fica na sessão da aba: outra aba é outro trabalho, com outro recorte.
 */

const LISTAS = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_NAV];
const CHAVE = "cotapro:lista:";

/** Partes fixas de rota que viram nome na trilha. */
const SUBPAGINAS: Record<string, string> = {
  novo: "Novo",
  nova: "Nova",
  editar: "Editar",
  excluir: "Excluir",
  historico: "Histórico",
  divergencias: "Divergências",
  importacoes: "Importações",
  categorias: "Categorias",
  unidades: "Unidades",
  "correcao-unidades": "Correção de unidades",
  atributos: "Atributos",
  relatorio: "Relatório",
  comparacao: "Comparação",
  alocacao: "Decisão de compra",
  nota: "Nota fiscal",
  documentos: "Documentos",
};

function secaoDe(pathname: string) {
  return LISTAS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

/* A anotação muda só quando a lista é revisitada, e aí o link já foi
   desmontado: não há o que assinar. */
const semAssinatura = () => () => {};

function lerLista(href: string) {
  try {
    return sessionStorage.getItem(CHAVE + href) ?? href;
  } catch {
    return href;
  }
}

/* O título de um registro (nome da rodada, número do pedido) só a página
   conhece. Ela o publica aqui e a trilha, que mora no layout, o lê. */
let tituloAtual: string | null = null;
const ouvintes = new Set<() => void>();
function publicar(titulo: string | null) {
  tituloAtual = titulo;
  ouvintes.forEach((ouvir) => ouvir());
}
function useTituloAtual() {
  return React.useSyncExternalStore(
    (ouvir) => {
      ouvintes.add(ouvir);
      return () => ouvintes.delete(ouvir);
    },
    () => tituloAtual,
    () => null,
  );
}

/** Põe o nome do registro aberto na trilha enquanto a página estiver montada. */
export function CrumbTitle({ title }: { title: string }) {
  React.useEffect(() => {
    publicar(title);
    return () => publicar(null);
  }, [title]);
  return null;
}

/** Link para uma lista que devolve o recorte em que ela foi deixada. */
export function ListLink({
  href,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  // A anotação só existe no navegador: o servidor desenha a lista crua e a
  // hidratação troca pelo recorte guardado, sem um render a mais.
  const destino = React.useSyncExternalStore(
    semAssinatura,
    () => lerLista(href),
    () => href,
  );
  return <Link href={destino} {...props} />;
}

/** Anota a URL da lista à vista. Precisa de `Suspense` por ler a querystring. */
export function ListUrlMemory() {
  const pathname = usePathname();
  const busca = useSearchParams().toString();
  React.useEffect(() => {
    if (!LISTAS.some((item) => item.href === pathname)) return;
    try {
      sessionStorage.setItem(
        CHAVE + pathname,
        busca ? `${pathname}?${busca}` : pathname,
      );
    } catch {
      // Navegação privada sem armazenamento: o link volta à lista crua.
    }
  }, [pathname, busca]);
  return null;
}

export function AppBreadcrumb({ className }: { className?: string }) {
  const pathname = usePathname();
  const titulo = useTituloAtual();
  const secao = secaoDe(pathname);
  if (!secao) return null;

  const resto = pathname
    .slice(secao.href.length)
    .split("/")
    .filter(Boolean);
  const nomes = resto
    .map((parte) => SUBPAGINAS[parte])
    .filter((nome): nome is string => Boolean(nome));
  const ultimo = titulo ?? nomes.at(-1) ?? null;
  const meio = titulo ? nomes : nomes.slice(0, -1);

  return (
    <nav aria-label="Você está em" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="shrink-0">
          {ultimo ? (
            <ListLink
              href={secao.href}
              className="text-fg-muted hover:text-fg rounded-sm transition-colors"
            >
              {secao.label}
            </ListLink>
          ) : (
            <span aria-current="page" className="text-fg font-semibold">
              {secao.label}
            </span>
          )}
        </li>
        {meio.map((nome) => (
          <Passo key={nome}>
            <span className="text-fg-muted">{nome}</span>
          </Passo>
        ))}
        {ultimo ? (
          <Passo>
            <span
              aria-current="page"
              className="text-fg block truncate font-semibold"
            >
              {ultimo}
            </span>
          </Passo>
        ) : null}
      </ol>
    </nav>
  );
}

function Passo({ children }: { children: React.ReactNode }) {
  return (
    <>
      <li aria-hidden className="text-fg-subtle shrink-0">
        <ChevronRight className="size-3.5" />
      </li>
      <li className="min-w-0">{children}</li>
    </>
  );
}
