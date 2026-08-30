/**
 * O andar de Pedidos, com a vaga do modal.
 *
 * Mesmo desenho de Compras: `@modal` é rota paralela, renderiza ao lado de
 * `children` e não vira segmento da URL. Quem clica em "Novo pedido" na lista
 * continua em `/pedidos`, com a tabela atrás, e o formulário abre por cima —
 * mas o endereço vira `/pedidos/novo`, então F5 e link colado caem na página
 * inteira, com o mesmo formulário.
 *
 * `@modal/(.)[id]` e `@modal/(.)divergencias` interceptam a navegação feita a
 * partir da lista. Um F5 ou link externo continua abrindo a página completa.
 * As rotas sem interceptação devolvem `null` para não deixar um modal antigo
 * pendurado quando a navegação muda de contexto.
 */
export default function PedidosLayout({
  children,
  modal,
}: LayoutProps<"/pedidos">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
