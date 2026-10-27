"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * A rede de segurança de toda a área logada.
 *
 * Sem isto, qualquer erro não tratado numa tela trocava a página inteira pela
 * tela de erro genérica do Next, sem o menu e sem saída. Aqui o menu e o
 * cabeçalho continuam (a moldura é do layout), e a pessoa tem as duas saídas
 * que quer: tentar de novo ou voltar ao começo.
 *
 * O texto não repete a mensagem técnica: ela não ajuda quem está comprando.
 */
export default function ErroDaArea({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] erro não tratado:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="border-border bg-surface mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 rounded-2xl border px-6 py-10 text-center shadow-xs"
    >
      <AlertCircle className="text-warning size-8" aria-hidden />
      <div>
        <h1 className="text-fg text-lg font-semibold">
          Não foi possível abrir esta tela
        </h1>
        <p className="text-fg-muted mt-1 text-sm">
          Foi um problema nosso, e nada do que você fez se perdeu. Tente de novo;
          se continuar, volte à Central operacional.
        </p>
        {error.digest ? (
          <p className="text-fg-subtle mt-2 text-xs">
            Código para o suporte: {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={reset}>
          <RefreshCw aria-hidden /> Tentar de novo
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Ir para a Central operacional</Link>
        </Button>
      </div>
    </div>
  );
}
