"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * O modal do sistema.
 *
 * POR QUE RADIX E NÃO UM `<div>` COM `position: fixed`
 *
 * Um modal correto é mais do que uma caixa por cima: o foco tem que ficar
 * preso dentro dele, Esc tem que fechar, o resto da página tem que ficar
 * inerte para o leitor de tela, o foco tem que voltar para o botão que abriu, e
 * a rolagem de trás tem que travar. São seis coisas, todas fáceis de esquecer e
 * nenhuma visível em quem enxerga e usa mouse. O Radix já estava nas
 * dependências e faz as seis.
 *
 * NO CELULAR ELE VIRA TELA
 *
 * Uma caixa flutuante de 500px numa tela de 375px é uma página com margem
 * inútil dos lados. Abaixo de `sm` o conteúdo ocupa a tela inteira e rola por
 * dentro — o que a pessoa vê é uma tela, que é o que ela é ali.
 *
 * FECHAR SEM QUERER
 *
 * Esc e clique fora são atalhos ótimos para um modal de leitura e péssimos para
 * um formulário meio preenchido. `impedirFechamentoAcidental` desliga os dois;
 * o X e os botões continuam funcionando. Quem tem formulário liga isso quando
 * há o que perder — `useFormularioSujo` abaixo é a forma barata de saber.
 */

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const dialogContentVariants = cva(
  [
    "bg-surface text-fg fixed z-50 flex flex-col shadow-lg",
    // Celular: tela inteira, sem cantos arredondados nem margem.
    "inset-0 max-h-dvh w-full",
    // Desktop: caixa centrada, com teto de altura para o conteúdo rolar por
    // dentro em vez de a página crescer atrás.
    "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2",
    "sm:border-border sm:rounded-xl sm:border",
    "data-[state=open]:animate-ds-in outline-none",
  ],
  {
    variants: {
      size: {
        /** Formulário de dois ou três campos. */
        sm: "sm:w-[min(28rem,calc(100vw-2rem))]",
        /** Formulário com lista curta dentro. */
        md: "sm:w-[min(40rem,calc(100vw-2rem))]",
        /** Área de trabalho: tabelas, abas, várias seções. */
        lg: "sm:w-[min(64rem,calc(100vw-2rem))]",
        /**
         * Matriz larga: comparação de respostas, decisão de compra.
         *
         * A tabela de comparação tem uma coluna por fornecedor. Com seis ela
         * não cabe em tela nenhuma e rola de lado por dentro de qualquer
         * jeito — mas em `xl` a rolagem começa depois, e não antes.
         */
        xl: "sm:w-[min(82rem,calc(100vw-2rem))]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function DialogContent({
  className,
  size,
  children,
  impedirFechamentoAcidental = false,
  alturaEstavel = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    /** Esc e clique fora deixam de fechar. O X continua fechando. */
    impedirFechamentoAcidental?: boolean;
    /**
     * Altura fixa em vez de altura do conteúdo.
     *
     * Serve ao modal que troca de conteúdo por dentro. Sem isto, a caixa
     * encolhe ao ir da rodada (muitas seções) para a comparação (uma tabela
     * curta) e cresce de volta na seguinte — e o pulo faz parecer que se
     * trocou de tela, que é exatamente o que o modal existe para evitar.
     *
     * Só no desktop: no celular a caixa já é a tela inteira.
     */
    alturaEstavel?: boolean;
  }) {
  const barrar = impedirFechamentoAcidental
    ? (evento: Event) => evento.preventDefault()
    : undefined;

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="data-[state=open]:animate-ds-fade fixed inset-0 z-50 bg-black/50"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          dialogContentVariants({ size }),
          alturaEstavel && "sm:h-[85dvh]",
          className,
        )}
        onEscapeKeyDown={barrar}
        onInteractOutside={barrar}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "text-fg-subtle hover:bg-surface-muted hover:text-fg absolute top-3 right-3",
            "focus-visible:border-ring focus-visible:ring-ring/50 grid size-7 place-items-center",
            "rounded-md transition-colors outline-none focus-visible:ring-3",
          )}
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Cabeçalho fixo: fica parado enquanto o corpo rola. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "border-border shrink-0 border-b px-5 py-4 pr-12",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-fg text-base font-semibold", className)}
      {...props}
    />
  );
}

/**
 * A linha de explicação embaixo do título.
 *
 * O Radix exige uma descrição — ou um `aria-describedby={undefined}` explícito —
 * porque um modal anunciado só pelo título deixa quem usa leitor de tela sem
 * saber o que a caixa quer. Não é burocracia: é a frase que a pessoa que enxerga
 * lê de graça no meio da tela.
 */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-fg-muted mt-1 text-sm", className)}
      {...props}
    />
  );
}

/** O corpo, que é a única parte que rola. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}
      {...props}
    />
  );
}

/** Rodapé fixo: o botão de confirmar não foge com a rolagem. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "border-border flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * "Tem algo aqui que se perde se fechar agora?"
 *
 * Eventos de `input` borbulham até o `<form>`, então um `onChange` no
 * formulário inteiro responde isso sem controlar campo nenhum — nenhum
 * `useState` por campo, nenhuma re-renderização a cada tecla.
 */
export function useFormularioSujo() {
  const [sujo, setSujo] = React.useState(false);

  return {
    sujo,
    /** Vai no `onChange` do `<form>`. */
    marcarSujo: React.useCallback(() => setSujo(true), []),
    /** Chame ao salvar ou ao descartar de propósito. */
    limpar: React.useCallback(() => setSujo(false), []),
  };
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
};
