/**
 * O andar de Compras, com uma vaga extra para o modal.
 *
 * `modal` é uma rota paralela (a pasta `@modal`): ela renderiza ao lado de
 * `children`, sem virar segmento da URL. Hoje só `/compras/nova` abre por cima
 * da lista; a rodada (`/compras/<id>`) é uma página, com cabeçalho e abas no
 * `layout.tsx` de `[id]/(rodada)`.
 *
 * Fora desse caso a vaga fica vazia: `@modal/default.tsx` e as rotas de
 * `sem-modal.tsx` devolvem `null`. São elas que fazem o modal FECHAR ao
 * navegar para dentro da rodada — sem elas, uma rota paralela que deixa de
 * casar continua desenhada na tela.
 *
 * SE O MODAL PARAR DE ABRIR EM DESENVOLVIMENTO
 *
 * O `next dev` do 16.3.0 vai acumulando o marcador de interceptação no caminho
 * que o cliente pede depois de muitas recompilações na mesma sessão. Quando
 * isso acontece o pedido devolve 500 e o navegador cai na página inteira, que
 * é o mesmo conteúdo; nada se perde. Reiniciar o `next dev` limpa. Não acontece
 * no `next build` + `next start`.
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
