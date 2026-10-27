"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

/**
 * O que aparece no lugar de UM bloco do painel que não carregou.
 *
 * O painel tem blocos independentes — prioridades, resultado do mês, atividade.
 * Uma falha na atividade, que é o que menos importa, não pode apagar a lista de
 * prioridades, que é o que mais importa. Cada bloco falha sozinho, diz qual
 * foi, e oferece tentar de novo sem recarregar a página inteira.
 */
export function SectionError({ nome }: { nome: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section
      role="alert"
      className="border-border bg-surface mt-6 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-4 shadow-xs sm:px-5"
    >
      <AlertCircle className="text-warning size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-medium">
          Não foi possível carregar {nome}.
        </p>
        <p className="text-fg-muted text-xs">
          O resto da tela continua funcionando.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? "Tentando…" : "Tentar de novo"}
      </Button>
    </section>
  );
}
