import { ProdutoContent } from "@/app/(app)/produtos/historico/[id]/page";

/**
 * O histórico do produto por cima da lista.
 *
 * POR QUE A ROTA É `/produtos/historico/<id>` E NÃO `/produtos/<id>`
 *
 * Interceptação que casa SUBSTITUI a navegação: o `children` fica onde estava,
 * que é justamente o que faz o modal aparecer por cima da lista. Enquanto o
 * detalhe morava em `/produtos/[id]`, o interceptador era `(.)[id]` — e ele
 * casa com QUALQUER segmento sob `/produtos`, inclusive as irmãs estáticas
 * `importacoes`, `categorias` e `unidades`. Clicar em "Importar planilha"
 * caía aqui com o id valendo "importacoes": a lista não navegava e a tela
 * ficava parada, ou pior, o `notFound()` subia até a raiz e trocava a página
 * por um 404.
 *
 * Não existe sintaxe de exclusão para isso. A saída é o interceptador exigir
 * DOIS segmentos — `(.)historico/[id]` —, que nenhuma irmã estática tem. Fica
 * correto por construção, e não por uma lista de exceções que a próxima rota
 * criada volta a furar.
 */
export default async function ProdutoEmModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ProdutoContent id={id} query={query} emModal />;
}
