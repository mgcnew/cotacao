"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import {
  ErrorLine,
  selectClass,
  Submit,
} from "@/components/orders/order-item-rows";
import { Button } from "@/components/ui/button";
import {
  generateOrderLink,
  markOrderSent,
  sendOrderWhatsApp,
  type OrderActionState,
} from "@/features/orders/actions";
import { whatsappLink } from "@/features/orders/message";

export type SendContact = {
  id: string;
  name: string;
  role: string | null;
  whatsapp: string;
  isPrimary: boolean;
};

function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden /> Copiado
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden /> {label}
        </>
      )}
    </Button>
  );
}

/**
 * Envio do pedido ao fornecedor, pelas mãos de quem compra.
 *
 * São três coisas separadas de propósito, e a ordem importa:
 *  1. gerar o link, que existe em texto puro uma única vez;
 *  2. mandar a mensagem — pelo WhatsApp do contato, ou copiando e colando
 *     onde a pessoa quiser;
 *  3. dizer que mandou, que é o único momento em que o pedido muda de estado.
 *
 * O passo 3 não acontece sozinho porque o sistema não tem como saber se a
 * mensagem saiu. Enquanto quem envia é gente, quem confirma o envio é gente.
 */
export function SendOrderControls({
  orderId,
  revisionId,
  contacts,
  previewMessage,
  evolutionReady,
  aoEnviar,
}: {
  orderId: string;
  revisionId: string;
  contacts: SendContact[];
  /** A mensagem sem o link, para se ler antes mesmo de gerar um. */
  previewMessage: string;
  /** A Evolution está configurada no servidor? Sem ela, só o caminho manual. */
  evolutionReady: boolean;
  /**
   * Avisa quem está por fora que o pedido saiu de verdade — é o que fecha o
   * modal quando estes controles moram dentro de um.
   *
   * Só os dois caminhos que movem o pedido avisam. Gerar link também devolve
   * `savedAt`, e quem olhasse só para isso fecharia o modal no meio do
   * caminho, antes de a mensagem sair.
   */
  aoEnviar?: () => void;
}) {
  // Envolver a action é o jeito honesto de saber que ela deu certo: o aviso sai
  // depois da resposta, dentro da transição, e não numa releitura de estado
  // durante a renderização de outro componente.
  const avisar = React.useCallback(
    (acao: (prev: OrderActionState, fd: FormData) => Promise<OrderActionState>) =>
      async (prev: OrderActionState, fd: FormData) => {
        const resultado = await acao(prev, fd);
        if (!resultado.error) aoEnviar?.();
        return resultado;
      },
    [aoEnviar],
  );

  const [linkState, generateAction] = useActionState<
    OrderActionState,
    FormData
  >(generateOrderLink, { error: null });
  const [sentState, sendAction] = useActionState<OrderActionState, FormData>(
    avisar(markOrderSent),
    { error: null },
  );
  const [autoState, autoAction] = useActionState<OrderActionState, FormData>(
    avisar(sendOrderWhatsApp),
    { error: null },
  );

  const [contactId, setContactId] = React.useState(
    contacts.find((c) => c.isPrimary)?.id ?? contacts[0]?.id ?? "",
  );

  const message = linkState.message ?? previewMessage;
  const contact = contacts.find((c) => c.id === contactId);
  const wa = contact ? whatsappLink(contact.whatsapp, message) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* O envio automático vem primeiro por ser o caminho curto quando existe:
          uma ação só, que manda a mensagem e move o pedido. Sem a Evolution
          configurada, ele simplesmente não aparece, e o manual abaixo continua
          sendo o caminho inteiro. */}
      {evolutionReady && contacts.length > 0 ? (
        <form
          action={autoAction}
          className="border-border bg-surface-sunken flex flex-col gap-2 rounded-lg border p-3"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="revisionId" value={revisionId} />
          <input type="hidden" name="contactId" value={contactId} />

          <p className="text-fg text-sm font-medium">Enviar pelo WhatsApp</p>

          <ErrorLine error={autoState.error} />

          <div className="flex flex-wrap items-center gap-2">
            <Submit
              label={`Enviar para ${contact?.name ?? "o contato"}`}
              busy="Enviando…"
            />
            <span className="text-fg-subtle text-xs">
              Gera o link, manda a mensagem e marca como enviado. Se a mensagem
              não sair, o pedido continua em rascunho.
            </span>
          </div>
        </form>
      ) : null}

      <form action={generateAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <Submit
          label={linkState.url ? "Gerar outro link" : "Gerar link do pedido"}
          busy="Gerando…"
        />
      </form>

      <ErrorLine error={linkState.error} />

      {linkState.url ? (
        <div className="border-border bg-surface-sunken flex flex-col gap-2 rounded-lg border p-2">
          <code className="text-fg-muted block overflow-x-auto text-xs whitespace-nowrap">
            {linkState.url}
          </code>
          <div className="flex items-center gap-2">
            <CopyButton value={linkState.url} label="Copiar link" />
            <span className="text-fg-subtle text-xs">
              Mostrado só desta vez.
            </span>
          </div>
        </div>
      ) : null}

      <div className="border-border bg-surface-sunken flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fg text-sm font-medium">Mensagem do pedido</p>
          {!linkState.url ? (
            <span className="text-fg-subtle text-xs">
              gere o link para incluí-lo na mensagem
            </span>
          ) : null}
        </div>

        <pre className="text-fg-muted max-h-56 overflow-auto text-xs whitespace-pre-wrap">
          {message}
        </pre>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={message} label="Copiar mensagem" />

          {contacts.length > 0 ? (
            <>
              <select
                aria-label="Contato do fornecedor"
                className={`${selectClass} w-auto min-w-40`}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.role ? ` · ${c.role}` : ""}
                  </option>
                ))}
              </select>

              {wa ? (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-3.5" aria-hidden /> Abrir no
                    WhatsApp
                  </a>
                </Button>
              ) : (
                <span className="text-fg-subtle text-xs">
                  O WhatsApp deste contato não parece um número válido.
                </span>
              )}
            </>
          ) : (
            <span className="text-fg-subtle text-xs">
              Este fornecedor não tem contato com WhatsApp cadastrado.
            </span>
          )}
        </div>
      </div>

      <form action={sendAction} className="flex flex-col gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="contactId" value={contactId} />
        <input
          type="hidden"
          name="channel"
          value={contacts.length > 0 ? "whatsapp" : "other"}
        />

        <ErrorLine error={sentState.error} />

        <div className="flex flex-wrap items-center gap-2">
          <Submit label="Marquei como enviado" busy="Registrando…" />
          <span className="text-fg-subtle text-xs">
            Só depois que a mensagem realmente sair. O envio fica registrado no
            histórico de comunicação.
          </span>
        </div>
      </form>
    </div>
  );
}
