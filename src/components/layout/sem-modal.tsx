/**
 * "Aqui não tem modal."
 *
 * Rota paralela que deixa de casar não some sozinha na navegação pelo cliente:
 * ela continua desenhada com o que tinha. Sem isto, sair da Central para a
 * alocação abriria a página nova com o modal pendurado por cima — comprovado
 * na tela, não suposto.
 *
 * A vaga é casada rota a rota, e não por um `[...tudo]`, porque um curinga que
 * pega qualquer profundidade abaixo de `/compras` também pega o segmento
 * marcado com `(.)` que o próprio Next usa para pedir a rota interceptada. Os
 * três caminhos abaixo têm forma fixa e não conseguem casar com ele.
 */
export default function SemModal() {
  return null;
}
