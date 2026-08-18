/**
 * Qualquer outra rota de Compras fecha o modal.
 *
 * Rota paralela que deixa de casar não some sozinha na navegação pelo cliente:
 * ela continua desenhada com o que tinha. Casar tudo com um componente que
 * devolve `null` é o jeito de dizer "aqui não tem modal" — é a receita da
 * própria documentação de rotas paralelas.
 */
export default function FechaOModal() {
  return null;
}
