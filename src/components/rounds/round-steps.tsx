import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A trilha de montagem da rodada.
 *
 * A Central da Rodada mostrava três blocos de uma vez — grupos, itens,
 * fornecedores — cada um com o seu formulário aberto, e nada dizia por onde
 * começar. Quem já conhece o fluxo escolhe sozinho; quem chegou hoje trava na
 * primeira tela.
 *
 * A trilha não esconde nada nem obriga ordem: os três blocos continuam na
 * página e podem ser preenchidos em qualquer sequência. O que ela faz é
 * responder "onde eu estou e o que falta" sem que a pessoa precise deduzir
 * isso de três seções vazias.
 *
 * Cada passo é um link para a sua âncora — no celular, onde os blocos ficam um
 * embaixo do outro, é o que evita rolar procurando.
 */

export type EstadoPasso = "feito" | "agora" | "depois";

export type PassoRodada = {
  titulo: string;
  /** O que já foi feito, em uma linha: "3 produtos", "nenhum ainda". */
  resumo: string;
  estado: EstadoPasso;
  /** `id` da seção correspondente, sem o `#`. */
  ancora: string;
};

export function RoundSteps({ passos }: { passos: PassoRodada[] }) {
  return (
    <nav aria-label="Montagem da rodada" className="mb-8">
      <ol className="grid gap-2 sm:grid-cols-3">
        {passos.map((passo, indice) => (
          <li key={passo.ancora}>
            <a
              href={`#${passo.ancora}`}
              // `aria-current="step"` é o que faz o leitor de tela anunciar
              // qual passo está em aberto; a cor sozinha não diz isso.
              aria-current={passo.estado === "agora" ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                "focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
                passo.estado === "agora"
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface hover:border-ring",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                  passo.estado === "feito"
                    ? "bg-success text-surface"
                    : passo.estado === "agora"
                      ? "bg-primary text-primary-fg"
                      : "bg-surface-muted text-fg-subtle",
                )}
              >
                {passo.estado === "feito" ? (
                  <Check className="size-4" />
                ) : (
                  indice + 1
                )}
              </span>

              <span className="min-w-0">
                <span className="text-fg block text-sm font-medium">
                  {passo.titulo}
                </span>
                <span className="text-fg-muted block text-xs">
                  {passo.resumo}
                </span>
              </span>

              {/* O estado também em texto, para quem não vê a cor nem o ícone. */}
              <span className="sr-only">
                {passo.estado === "feito"
                  ? "— concluído"
                  : passo.estado === "agora"
                    ? "— em aberto"
                    : "— pendente"}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
