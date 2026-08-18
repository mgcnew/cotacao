/**
 * O andar de Pedidos, com a vaga do modal.
 *
 * Mesmo desenho de Compras: `@modal` é rota paralela, renderiza ao lado de
 * `children` e não vira segmento da URL. Quem clica em "Novo pedido" na lista
 * continua em `/pedidos`, com a tabela atrás, e o formulário abre por cima —
 * mas o endereço vira `/pedidos/novo`, então F5 e link colado caem na página
 * inteira, com o mesmo formulário.
 *
 * `@modal/[id]` e `@modal/novo` devolvem `null` pelo mesmo motivo de lá: rota
 * paralela que deixa de casar continua desenhada, e abrir um pedido a partir do
 * modal o deixaria pendurado por cima da ficha.
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
