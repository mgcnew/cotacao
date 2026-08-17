/**
 * Quantos fornecedores já responderam, em número e em barra.
 *
 * A barra existe porque "3 de 8" exige uma conta mental que a lista faz o
 * tempo todo; a proporção se vê sem pensar. Mas o número fica: barra sozinha
 * não diz quantos faltam, e é isso que se vai cobrar.
 *
 * `role="progressbar"` com os três `aria-value*` é o que faz o leitor de tela
 * anunciar "3 de 8" em vez de ignorar uma `div` colorida. O `aria-label`
 * nomeia o que está progredindo, já que a linha tem várias colunas de números.
 */
export function ResponseProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <span className="text-fg-subtle text-xs">nenhum fornecedor</span>
    );
  }

  const proporcao = completed / total;
  const completo = completed === total;

  return (
    <div className="flex min-w-24 flex-col gap-1">
      <span
        className={`text-xs tabular-nums ${
          completo ? "text-success font-medium" : "text-fg-muted"
        }`}
      >
        {completed} de {total}
      </span>
      <div
        role="progressbar"
        aria-label="Fornecedores que responderam"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        className="bg-surface-muted h-1 w-full overflow-hidden rounded-full"
      >
        <div
          className={`h-full rounded-full ${
            completo ? "bg-success" : "bg-primary"
          }`}
          style={{ width: `${Math.round(proporcao * 100)}%` }}
        />
      </div>
    </div>
  );
}
