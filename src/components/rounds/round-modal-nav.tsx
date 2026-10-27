"use client";

import { ClipboardCheck, PackageSearch, Send, UsersRound } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { IntentPrefetchLink } from "@/components/layout/intent-prefetch-link";

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
   * `de`, o destino vale como ativo e uma barra fina corre sob a faixa. Quando
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
                active &&
                  "text-fg after:bg-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full",
              )}
            >
              <Icon className="size-4 sm:size-3.5" aria-hidden />
              <span className="sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </IntentPrefetchLink>
          );
        })}
      </div>

      {aguardando ? (
        <>
          {/* Uma barra de largura fixa sob a faixa: só a posição muda, então
              nada empurra o conteúdo. Com movimento reduzido o CSS global a
              deixa parada, e ela continua dizendo "carregando". */}
          <span
            aria-hidden
            className="bg-surface-muted pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
          >
            <span className="bg-primary-solid block h-full w-1/3 [animation:om-progress_1.1s_var(--ease)_infinite]" />
          </span>
          <span role="status" className="sr-only">
            Carregando…
          </span>
        </>
      ) : null}
    </nav>
  );
}
