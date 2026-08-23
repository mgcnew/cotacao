"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import {
  generateQuotationLink,
  markSupplierSent,
  type SendState,
} from "@/features/rounds/send";

function GenerateButton({
  hasLink,
  disabled,
}: {
  hasLink: boolean;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending || disabled}>
      {pending ? "Gerando…" : hasLink ? "Gerar outro link" : "Gerar link"}
    </Button>
  );
}

function SentButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Registrando…" : "Marquei como enviado"}
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
 * Gera o link da cotação de um fornecedor e registra o envio.
 *
 * O link aparece uma vez, aqui, e nunca mais: o banco guarda só o SHA-256 do
 * token. Se perder, gera outro — o antigo continua valendo até expirar, o que
 * é o comportamento certo quando o fornecedor já recebeu o primeiro.
 *
 * Gerar e registrar são passos separados porque quem manda a mensagem é a
 * pessoa: o sistema não tem como saber se ela saiu.
 */
export function SendControls({
  roundSupplierId,
  roundId,
  supplierName,
  alreadySent,
  groupSummary,
  itemCount,
  showSummary = true,
}: {
  roundSupplierId: string;
  roundId: string;
  supplierName: string;
  alreadySent: boolean;
  groupSummary: string[];
  itemCount: number;
  showSummary?: boolean;
}) {
  const [linkState, generateAction] = useActionState<SendState, FormData>(
    generateQuotationLink,
    { error: null },
  );
  const [sentState, sentAction] = useActionState<SendState, FormData>(
    markSupplierSent,
    { error: null },
  );

  return (
    <div className="flex flex-col items-end gap-2">
      {showSummary ? (
        <span className="text-fg-subtle max-w-64 text-right text-xs">
          {groupSummary.length > 0 ? groupSummary.join(", ") : "Nenhum grupo"} ·{" "}
          {itemCount} {itemCount === 1 ? "produto" : "produtos"}
        </span>
      ) : null}
      <form action={generateAction}>
        <input type="hidden" name="roundSupplierId" value={roundSupplierId} />
        <input type="hidden" name="roundId" value={roundId} />
        <span title={itemCount === 0 ? "Escolha um grupo com produtos" : undefined}>
          <GenerateButton hasLink={Boolean(linkState.url)} disabled={itemCount === 0} />
        </span>
      </form>

      <ErrorLine error={linkState.error} />

      {linkState.url ? (
        <div className="border-border bg-surface-sunken flex w-full max-w-md flex-col gap-2 rounded-lg border p-2">
          <code className="text-fg-muted block overflow-x-auto text-xs whitespace-nowrap">
            {linkState.url}
          </code>
          <div className="flex items-center gap-2">
            <CopyButton url={linkState.url} />
            <span className="text-fg-subtle text-xs">
              Mostrado só desta vez.
            </span>
          </div>
        </div>
      ) : null}

      {alreadySent ? null : (
        <form action={sentAction}>
          <input type="hidden" name="roundSupplierId" value={roundSupplierId} />
          <input type="hidden" name="roundId" value={roundId} />
          {/* O nome do fornecedor entra no rótulo acessível porque a tabela tem
              um destes por linha: "Marquei como enviado" repetido sete vezes
              não diz a um leitor de tela qual deles é qual. */}
          <span className="sr-only" id={`enviado-${roundSupplierId}`}>
            Marcar cotação de {supplierName} como enviada
          </span>
          <div aria-describedby={`enviado-${roundSupplierId}`}>
            <SentButton />
          </div>
        </form>
      )}

      <ErrorLine error={sentState.error} />
      <SuccessLine
        message={sentState.savedAt ? "Envio registrado." : null}
      />
    </div>
  );
}
