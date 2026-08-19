"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A trilha de montagem da rodada — agora uma aba por passo.
 *
 * ANTES ELA SÓ APONTAVA; AGORA ELA MOSTRA
 *
 * Os três blocos ficavam empilhados e a trilha era só um atalho de rolagem.
 * Numa tela isso é uma parede: quem está escolhendo produtos vê, logo abaixo,
 * o convite de fornecedores e o botão de iniciar — decisões que ainda não são
 * a dele. Agora só o passo escolhido aparece.
 *
 * OCULTO, E NÃO DESMONTADO
 *
 * Os painéis inativos continuam no DOM com `hidden`. É a diferença que
 * importa: o passo de produtos tem formulário — produto escolhido, quantidade
 * digitada, grupo aberto. Desmontar ao trocar de aba apagaria isso, e quem
 * fosse conferir uma unidade em "Fornecedores" voltaria para um formulário
 * vazio. Como as três seções vêm prontas do servidor, mantê-las montadas não
 * custa consulta nenhuma.
 *
 * ONDE ELA ABRE
 *
 * No passo que está em aberto — quem entra numa rodada pela metade cai onde
 * parou. Mas a escolha inicial é lida UMA vez: adicionar um produto muda o
 * estado dos passos, e se a aba seguisse esse estado ela pularia sozinha para
 * "Fornecedores" no meio do cadastro do segundo produto.
 */

export type EstadoPasso = "feito" | "agora" | "depois";

export type PassoRodada = {
  chave: string;
  titulo: string;
  /** O que já foi feito, em uma linha: "3 produtos", "nenhum ainda". */
  resumo: string;
  estado: EstadoPasso;
  /** O conteúdo do passo, renderizado no servidor. */
  painel: React.ReactNode;
};

export function RoundSteps({ passos }: { passos: PassoRodada[] }) {
  const [ativo, setAtivo] = React.useState(
    () => passos.find((p) => p.estado === "agora")?.chave ?? passos[0]?.chave,
  );

  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());

  // Setas andam entre as abas — é o que `role="tablist"` promete a quem navega
  // pelo teclado, e sem isso a promessa fica só no atributo.
  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    const passo =
      evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (passo === 0) return;
    evento.preventDefault();

    const proximo = (indice + passo + passos.length) % passos.length;
    const chave = passos[proximo].chave;
    setAtivo(chave);
    refs.current.get(chave)?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Montagem da rodada"
        className="mb-6 grid gap-2 sm:grid-cols-3"
      >
        {passos.map((passo, indice) => {
          const selecionado = passo.chave === ativo;
          return (
            <button
              key={passo.chave}
              ref={(el) => {
                refs.current.set(passo.chave, el);
              }}
              type="button"
              role="tab"
              id={`aba-${passo.chave}`}
              aria-selected={selecionado}
              aria-controls={`painel-${passo.chave}`}
              tabIndex={selecionado ? 0 : -1}
              onClick={() => setAtivo(passo.chave)}
              onKeyDown={(e) => aoTeclar(e, indice)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                "focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
                selecionado
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
                    : selecionado
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

              {/* O estado também em texto: a cor e o ícone não chegam a quem
                  usa leitor de tela, e "concluído" é diferente de "selecionado". */}
              <span className="sr-only">
                {passo.estado === "feito"
                  ? "— concluído"
                  : passo.estado === "agora"
                    ? "— em aberto"
                    : "— pendente"}
              </span>
            </button>
          );
        })}
      </div>

      {passos.map((passo) => (
        <div
          key={passo.chave}
          role="tabpanel"
          id={`painel-${passo.chave}`}
          aria-labelledby={`aba-${passo.chave}`}
          hidden={passo.chave !== ativo}
          // `tabIndex={0}` porque um painel de aba precisa receber foco ao ser
          // aberto; sem isso o teclado pula direto para o primeiro campo e
          // perde o contexto de onde entrou.
          tabIndex={0}
          className="outline-none"
        >
          {passo.painel}
        </div>
      ))}
    </>
  );
}
