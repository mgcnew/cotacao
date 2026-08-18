/**
 * O andar de Compras, com uma vaga extra para o modal.
 *
 * `modal` é uma rota paralela (a pasta `@modal`): ela renderiza ao lado de
 * `children`, sem virar segmento da URL. Quando alguém abre uma rodada vindo da
 * lista, o Next intercepta `/compras/<id>` e desenha a Central nessa vaga, por
 * cima da lista, que continua montada atrás — a rolagem, os filtros e o
 * recorte ficam onde estavam.
 *
 * Fora desse caso a vaga fica vazia: `@modal/default.tsx` e o `[...tudo]`
 * devolvem `null`. O `[...tudo]` é o que faz o modal FECHAR ao navegar para
 * dentro da rodada — sem ele, uma rota paralela que deixa de casar continua
 * desenhada na tela, e "Decidir compra" abriria a alocação com o modal
 * pendurado por cima.
 */
export default function ComprasLayout({
  children,
  modal,
}: LayoutProps<"/compras">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
