"use client";

import { ClipboardCheck, PackageSearch, Send, UsersRound } from "lucide-react";
import { LayoutGroup, m } from "motion/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { IntentPrefetchLink } from "@/components/layout/intent-prefetch-link";
import { EASE } from "@/components/motion/movimento";

import { cn } from "@/lib/utils";

const tabs = [
  {
    key: "responses",
    label: "Respostas",
    mobileLabel: "Respostas",
    icon: Send,
  },
  {
    key: "distribution",
    label: "Distribuição",
    mobileLabel: "Distribuir",
    icon: UsersRound,
  },
  {
    key: "scope",
    label: "Produtos e grupos",
    mobileLabel: "Produtos",
    icon: PackageSearch,
  },
  {
    key: "decision",
    label: "Decisão",
    mobileLabel: "Decisão",
    icon: ClipboardCheck,
  },
] as const;

/**
 * `substituir` é o que as abas fazem com o histórico: no modal, trocar de aba
 * não pode empilhar entradas — o "voltar" fecha o modal. Na página, cada aba é
 * um passo, e o "voltar" do navegador deve andar entre elas.
 */
export function RoundModalNav({
  roundId,
  substituir = true,
}: {
  roundId: string;
  substituir?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A aba que a pessoa acabou de clicar, e de onde ela clicou. Ver abaixo.
  const [clique, setClique] = useState<{ key: string; de: string } | null>(
    null,
  );
  // O modal e a página podem estar montados juntos: cada faixa anima a própria
  // linha, sem uma puxar a da outra.
  const grupo = useId();
  if (pathname.endsWith("/relatorio")) return null;
  const inDecision =
    pathname.endsWith("/comparacao") || pathname.endsWith("/alocacao");
  const requested = searchParams.get("view");
  const current = inDecision
    ? "decision"
    : requested === "distribution" || requested === "scope"
      ? requested
      : "responses";

  /**
   * A aba acende NO CLIQUE, não quando o servidor responde.
   *
   * `current` vem de `usePathname`/`useSearchParams`, que só mudam quando a
   * navegação termina — e uma troca de aba custa de meio segundo a dois. Nesse
   * intervalo a tela parecia travada: a aba clicada continuava apagada, o corpo
   * continuava o mesmo, e a pessoa clicava de novo.
   *
   * O clique guarda o destino e de onde saiu. Enquanto a navegação não sai de
   * `de`, o destino vale como ativo e a linha dele pulsa. Quando
   * `current` muda, `de` deixa de bater e o estado se desfaz sozinho — sem
   * efeito, sem limpeza manual, e sem ficar preso se a pessoa voltar atrás.
   */
  const aguardando = clique && clique.de === current ? clique.key : null;
  const exibida = aguardando ?? current;

  return (
    <nav
      className="border-border relative shrink-0 overflow-hidden border-b px-2 sm:overflow-x-auto sm:px-4"
      aria-label="Áreas da rodada"
      aria-busy={aguardando !== null}
    >
      <LayoutGroup id={grupo}>
      <div className="grid w-full grid-cols-4 sm:flex sm:min-w-max sm:gap-1">
        {tabs.map(({ key, label, mobileLabel, icon: Icon }) => {
          const href =
            key === "responses"
              ? `/compras/${roundId}`
              : key === "decision"
                ? `/compras/${roundId}/comparacao`
                : `/compras/${roundId}?view=${key}`;
          const active = exibida === key;
          return (
            // Prefetch por intenção: passar o mouse, focar ou tocar já traz a
            // aba, e o clique seguinte encontra o dado pronto.
            <IntentPrefetchLink
              key={key}
              href={href}
              replace={substituir}
              aria-current={current === key ? "page" : undefined}
              onClick={(event) => {
                // Ctrl/Cmd/Shift-clique abrem em outra aba: esta não navega.
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                ) {
                  return;
                }
                if (key !== current) setClique({ key, de: current });
              }}
              className={cn(
                // No celular o ícone fica em cima do nome: quatro nomes lado a
                // lado em ~85px cada cortavam "Respostas" em "Respost…".
                "text-fg-muted hover:text-fg relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-xs font-medium transition-colors sm:h-11 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm",
                active && "text-fg",
              )}
            >
              <Icon className="size-4 sm:size-3.5" aria-hidden />
              <span className="sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline">{label}</span>
              {active ? <LinhaDaAba aguardando={aguardando !== null} /> : null}
            </IntentPrefetchLink>
          );
        })}
      </div>
      </LayoutGroup>

      {aguardando ? (
        <span role="status" className="sr-only">
          Carregando…
        </span>
      ) : null}
    </nav>
  );
}

/**
 * A linha sob a aba ativa. É uma só, que desliza de uma aba para a outra
 * (`layoutId`), em vez de sumir numa e surgir na outra. Antes, enquanto a
 * navegação não terminava, uma segunda barra corria por baixo da faixa inteira
 * e as duas disputavam a mesma linha; agora a espera é a própria linha
 * pulsando no destino.
 *
 * A largura acompanha o espaçamento da aba (`px-3` no desktop), para a linha
 * ter o tamanho do rótulo e não da área de toque.
 */
function LinhaDaAba({ aguardando }: { aguardando: boolean }) {
  return (
    <m.span
      aria-hidden
      layoutId="linha-da-aba"
      transition={{ duration: 0.25, ease: EASE }}
      animate={
        aguardando
          ? { opacity: [1, 0.4, 1], transition: { duration: 1.1, ease: EASE, repeat: Infinity } }
          : { opacity: 1 }
      }
      className="bg-primary pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full sm:inset-x-3"
    />
  );
}
