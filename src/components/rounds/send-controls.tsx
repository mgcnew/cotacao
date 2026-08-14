"use client";

import { AlertCircle, Check, Copy } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { generateQuotationLink, type SendState } from "@/features/rounds/send";

function GenerateButton({ hasLink }: { hasLink: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending}>
      {pending ? "Gerando…" : hasLink ? "Gerar outro link" : "Gerar link"}
    </Button>
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden />
          Copiado
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden />
          Copiar link
        </>
      )}
    </Button>
  );
}

/**
 * Gera e mostra o link da cotação de um fornecedor.
 *
 * O link aparece uma vez, aqui, e nunca mais: o banco guarda só o SHA-256 do
 * token. Se perder, gera outro — o antigo continua valendo até expirar, o que
 * é o comportamento certo quando o fornecedor já recebeu o primeiro.
 */
export function SendControls({
  roundSupplierId,
  roundId,
}: {
  roundSupplierId: string;
  roundId: string;
}) {
  const [state, formAction] = useActionState<SendState, FormData>(
    generateQuotationLink,
    { error: null },
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="roundSupplierId" value={roundSupplierId} />
        <input type="hidden" name="roundId" value={roundId} />
        <GenerateButton hasLink={Boolean(state.url)} />
      </form>

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-2 py-1 text-xs"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {state.url ? (
        <div className="border-border bg-surface-sunken flex w-full max-w-md flex-col gap-2 rounded-lg border p-2">
          <code className="text-fg-muted block overflow-x-auto text-xs whitespace-nowrap">
            {state.url}
          </code>
          <div className="flex items-center gap-2">
            <CopyButton url={state.url} />
            <span className="text-fg-subtle text-xs">
              Mostrado só desta vez.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
