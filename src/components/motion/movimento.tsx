"use client";

import { AnimatePresence, LazyMotion, MotionConfig, animate, m, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * As mesmas curvas e durações do CSS (`--ease`, `--dur`, `--dur-out` em
 * `globals.css`), para o que anima por aqui ter o ritmo dos diálogos.
 */
export const EASE = [0.2, 0.6, 0.3, 1] as const;
const ENTRADA = 0.2;
const SAIDA = 0.14;

const recursos = () => import("./recursos").then((modulo) => modulo.default);

/**
 * `strict` obriga a usar `m.*` em vez de `motion.*`, que carregaria tudo de
 * uma vez. `reducedMotion="user"` respeita quem desligou animações no
 * sistema: sobra só a troca de opacidade.
 */
export function Movimento({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={recursos} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: ENTRADA, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

const ABERTO = { opacity: 1, height: "auto", display: "block", transitionEnd: { overflow: "visible" } } as const;
const FECHADO = { opacity: 0, height: 0, overflow: "hidden" } as const;
const FECHANDO = { ...FECHADO, transition: { duration: SAIDA, ease: EASE } } as const;
const ESCONDIDO = { ...FECHANDO, display: "none" } as const;

/**
 * Item de lista que entra abrindo e sai fechando: os vizinhos acompanham a
 * altura em vez de pular. Dentro de um `AnimatePresence`, sai sozinho quando
 * some da lista; `fechado` fecha na hora, para quem esconde o item antes de
 * o servidor confirmar (remoção otimista).
 *
 * A altura que anima é a do `li`; o espaçamento vai no bloco de dentro
 * (`conteudoClassName`), senão o padding sobra quando a altura chega a zero.
 * No `li` ficam só borda e fundo. O `overflow: hidden` só vale durante a
 * animação: parado, o anel de foco dos campos não pode ser cortado.
 *
 * `entrada={false}` é para listas fora de um `AnimatePresence` cujas chaves
 * mudam quando o item muda: sem isso, cada edição abriria o item de novo.
 *
 * `reordena` liga a animação de posição. Fica desligada por padrão porque mede
 * cada item a cada renderização, e listas longas digitando ficam pesadas.
 *
 * `como="div"` para linhas que não estão num `ul`.
 */
export function ItemAnimado({
  fechado = false,
  reordena = false,
  entrada = true,
  como = "li",
  className,
  conteudoClassName,
  children,
}: {
  fechado?: boolean;
  reordena?: boolean;
  entrada?: boolean;
  como?: "li" | "div";
  className?: string;
  conteudoClassName?: string;
  children: ReactNode;
}) {
  const Elemento = como === "div" ? m.div : m.li;
  return (
    <Elemento
      layout={reordena ? "position" : undefined}
      initial={entrada ? FECHADO : false}
      animate={fechado ? ESCONDIDO : ABERTO}
      exit={FECHANDO}
      aria-hidden={fechado || undefined}
      className={className}
    >
      <div className={conteudoClassName}>{children}</div>
    </Elemento>
  );
}

export type ItemDaLista = { key: string; className?: string; conteudo: ReactNode };

/**
 * Lista de `ItemAnimado` para Server Components.
 *
 * Recebe os itens como dados, não como `children`: o `AnimatePresence`
 * precisa de elementos com `key` como filhos diretos, e o que vem de um
 * Server Component pode chegar embrulhado.
 *
 * Nada anima na primeira pintura (`initial={false}`): só o que muda depois,
 * quando uma escolha é salva, desfeita ou a ordem troca.
 */
export function ListaAnimada({ itens, className, reordena = true }: { itens: ItemDaLista[]; className?: string; reordena?: boolean }) {
  return (
    <ul className={className}>
      <AnimatePresence initial={false}>
        {itens.map((item) => (
          <ItemAnimado key={item.key} reordena={reordena} conteudoClassName={item.className}>
            {item.conteudo}
          </ItemAnimado>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Valor em reais que corre do número antigo até o novo quando muda. Na
 * primeira pintura já sai o valor final, igual ao do servidor.
 *
 * `useLayoutEffect` porque o React já escreveu o valor novo no DOM: a
 * animação precisa voltar ao antigo antes da pintura, ou o número pisca.
 */
export function DinheiroAnimado({ valor, className }: { valor: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(valor);
  const reduzir = useReducedMotion();

  useLayoutEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    const elemento = ref.current;
    if (!elemento || de === valor) return;
    if (reduzir) {
      elemento.textContent = MONEY.format(valor);
      return;
    }
    elemento.textContent = MONEY.format(de);
    const controle = animate(de, valor, {
      duration: 0.6,
      ease: EASE,
      onUpdate: (atual) => {
        elemento.textContent = MONEY.format(atual);
      },
    });
    return () => controle.stop();
  }, [valor, reduzir]);

  return <span ref={ref} className={className}>{MONEY.format(valor)}</span>;
}
