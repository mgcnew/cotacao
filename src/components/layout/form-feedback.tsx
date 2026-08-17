import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * O que o formulário responde depois de enviado.
 *
 * Estava reescrito em cinco arquivos, cada um com sua variação — e o sucesso, na
 * maioria deles, aparecia só visualmente. Quem usa leitor de tela apertava
 * "Salvar" e não recebia notícia nenhuma.
 *
 * Os dois papéis são diferentes de propósito:
 *
 *  - erro usa `role="alert"`, que interrompe a leitura: quem acabou de tentar
 *    salvar precisa saber agora que não salvou;
 *  - sucesso usa `role="status"` com `aria-live="polite"`, que espera a leitura
 *    corrente terminar. Confirmação não é urgência.
 */
export function ErrorLine({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {error}
    </p>
  );
}

export function SuccessLine({
  message,
}: {
  message: string | null | undefined;
}) {
  if (!message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="bg-success-soft text-success flex items-start gap-2 rounded-md px-3 py-2 text-sm"
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
