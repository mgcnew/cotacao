"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * O modal que é uma rota.
 *
 * POR QUE ROTA, E NÃO UM ESTADO NA LISTA
 *
 * "Montar e iniciar" é trabalho de vários minutos: adicionar produto, convidar
 * fornecedor, conferir, iniciar. Um modal comum, guardado num `useState` da
 * lista, some no F5, não sobrevive a um link colado no WhatsApp e engole o
 * botão "voltar" do navegador — que é o gesto que todo mundo usa para fechar.
 *
 * Rota interceptada resolve os três de uma vez. A URL continua sendo
 * `/compras/<id>`: vindo da lista, o Next intercepta e desenha por cima dela;
 * de F5 ou link colado, não há o que interceptar e a mesma rodada abre em
 * página inteira. Voltar fecha; avançar reabre.
 *
 * COMO SE FECHA
 *
 * `router.back()`, e não `push("/compras")`: fechar é desfazer a navegação que
 * abriu, e desfazer devolve a lista com a rolagem onde estava — inclusive para
 * quem abriu a rodada vindo do painel, que volta para o painel.
 *
 * O contexto abaixo existe para quem está lá dentro. `StartRoundPanel` mora a
 * cinco componentes de distância, do outro lado de componentes de servidor, e
 * precisa fechar o modal quando a rodada inicia. Contexto atravessa isso;
 * `props` não atravessariam.
 */

type Fechamento = { fechar: () => void };

const ContextoDoModalDeRota = React.createContext<Fechamento | null>(null);

/**
 * Devolve `null` quando o componente não está dentro de um modal de rota.
 *
 * É o que permite a um formulário servir aos dois embrulhos sem saber onde
 * está: na página inteira não há o que fechar, e ele segue como sempre foi.
 */
export function useModalDeRota(): Fechamento | null {
  return React.useContext(ContextoDoModalDeRota);
}

/**
 * Envolve uma action para que, dentro do modal de rota, o sucesso feche a caixa.
 *
 * Fora do modal devolve a action intacta: o mesmo formulário serve à página
 * inteira sem saber que existe modal nenhum.
 *
 * O aviso sai DEPOIS da resposta, dentro da transição do formulário — e não
 * relendo estado durante a renderização, que é o jeito que o React proíbe de um
 * componente mexer em outro.
 */
export function useFechaModalAoConcluir<E extends { error: string | null }>(
  acao: (anterior: E, dados: FormData) => Promise<E>,
): (anterior: E, dados: FormData) => Promise<E> {
  const modal = useModalDeRota();

  return React.useCallback(
    async (anterior: E, dados: FormData) => {
      const resultado = await acao(anterior, dados);
      if (!resultado.error) modal?.fechar();
      return resultado;
    },
    [acao, modal],
  );
}

export function RouteModal({
  titulo,
  descricao,
  acao,
  size = "lg",
  alturaEstavel = false,
  impedirFechamentoAcidental = false,
  children,
}: {
  /** Pode ser um `<Suspense>`: o modal abre antes de o nome chegar. */
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Ação contextual do conteúdo, posicionada antes do botão de fechar. */
  acao?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Altura fixa — para o modal que troca de conteúdo sem trocar de caixa. */
  alturaEstavel?: boolean;
  /** Impede que Esc ou um clique fora descartem um formulário em andamento. */
  impedirFechamentoAcidental?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  /**
   * O modal fecha em dois tempos, e precisa ser assim.
   *
   * Aqui `open` nunca virava `false`: fechar era navegar, e a navegação
   * arrancava o componente da árvore. Para o React isso é desmontagem, não
   * fechamento — nenhuma animação de saída chega a tocar, e a caixa some de
   * um quadro para o outro.
   *
   * Agora o clique só marca `aberto = false`. O Radix mantém o elemento vivo
   * enquanto a animação de saída roda e, quando ela termina, aí sim voltamos
   * na história. Continua sendo `router.back()`, e não `push`: fechar é
   * desfazer a navegação que abriu, o que devolve a lista com a rolagem onde
   * estava — inclusive para quem abriu vindo do painel.
   */
  const [aberto, setAberto] = React.useState(true);
  const voltando = React.useRef(false);

  const voltar = React.useCallback(() => {
    if (voltando.current) return;
    voltando.current = true;
    router.back();
  }, [router]);

  const fechar = React.useCallback(() => setAberto(false), []);

  const valor = React.useMemo(() => ({ fechar }), [fechar]);

  // Se por algum motivo a animação não rodar — elemento oculto, `animationend`
  // engolido —, o fechamento não pode ficar preso na tela. O prazo é folgado
  // de propósito: ele nunca deve ser o caminho normal.
  React.useEffect(() => {
    if (aberto) return;
    const prazo = window.setTimeout(voltar, 400);
    return () => window.clearTimeout(prazo);
  }, [aberto, voltar]);

  return (
    <ContextoDoModalDeRota.Provider value={valor}>
      <Dialog
        open={aberto}
        onOpenChange={(proximo) => {
          if (!proximo) fechar();
        }}
      >
        <DialogContent
          size={size}
          alturaEstavel={alturaEstavel}
          impedirFechamentoAcidental={impedirFechamentoAcidental}
          // `animationend` sobe do conteúdo do modal também — só a animação
          // da própria caixa encerra a navegação.
          onAnimationEnd={(evento) => {
            if (!aberto && evento.target === evento.currentTarget) voltar();
          }}
        >
          <DialogHeader className={acao ? "flex flex-row items-start gap-3" : undefined}>
            <div className="min-w-0 flex-1">
              <DialogTitle>{titulo}</DialogTitle>
              {descricao ? (
                <DialogDescription>{descricao}</DialogDescription>
              ) : (
                // O Radix exige a descrição para não anunciar um modal só pelo
                // título. Quando ela ainda está a caminho, o elemento existe
                // vazio — o `aria-describedby` aponta para algo desde o início.
                <DialogDescription />
              )}
            </div>
            {acao ? <div className="shrink-0">{acao}</div> : null}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </ContextoDoModalDeRota.Provider>
  );
}
