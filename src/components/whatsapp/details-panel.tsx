"use client";

import { BellOff, BellRing, ExternalLink, Phone, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ContactAvatar } from "@/components/whatsapp/contact-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { conversationTitle } from "@/features/whatsapp/inbox-logic";
import type {
  AwaitingSide,
  ConversationContext,
  InboxConversation,
} from "@/features/whatsapp/types";
import { cn } from "@/lib/utils";

export function formatPhone(phone: string | null) {
  if (!phone) return null;
  const match = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : `+${phone}`;
}

const PENDING_OPTIONS: Array<{ value: AwaitingSide | null; label: string }> = [
  { value: "buyer", label: "Você" },
  { value: "supplier", label: "Fornecedor" },
  { value: null, label: "Ninguém" },
];

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  );
}

/**
 * Quem a conversa está esperando, o fornecedor e a compra a que ela pertence.
 *
 * Em telas largas é uma coluna; nas demais, uma folha por cima da conversa
 * (`onClose` aparece só nela). O conteúdo é o mesmo.
 */
export function DetailsPanel({
  conversation,
  context,
  canSend,
  onSetAwaiting,
  onSetCategory,
  onClose,
}: {
  conversation: InboxConversation;
  context: ConversationContext | null;
  canSend: boolean;
  onSetAwaiting: (side: AwaitingSide | null) => void;
  onSetCategory: (category: InboxConversation["category"]) => void;
  onClose?: () => void;
}) {
  const title = conversationTitle(conversation);
  const phone = formatPhone(conversation.phone);
  const promotion = conversation.category === "promotion";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex items-center gap-2 px-4 pt-3 xl:hidden">
        <h2 className="text-fg flex-1 text-sm font-semibold">Detalhes</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-8 place-items-center rounded-md pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="space-y-6 p-4">
        <section className="flex items-start gap-3">
          <ContactAvatar
            name={title}
            linked={Boolean(conversation.supplierId)}
            className="size-12 text-base"
          />
          <div className="min-w-0">
            <p className="text-fg truncate text-sm font-semibold">{title}</p>
            {conversation.supplierId && conversation.contactName ? (
              <p className="text-fg-muted truncate text-xs">
                {conversation.contactName}
              </p>
            ) : null}
            {phone ? (
              <p className="text-fg-muted mt-1 flex items-center gap-1.5 text-xs tabular-nums">
                <Phone className="size-3" aria-hidden />
                {phone}
              </p>
            ) : null}
            {conversation.supplierId ? (
              <Link
                href={`/fornecedores/${conversation.supplierId}`}
                className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                Abrir cadastro <ExternalLink className="size-3" aria-hidden />
              </Link>
            ) : (
              <p className="text-warning mt-1.5 text-xs">
                Ainda não é um fornecedor cadastrado.
              </p>
            )}
          </div>
        </section>

        {!promotion ? (
          <section className="space-y-2">
            <SectionTitle>Quem responde agora</SectionTitle>
            {canSend ? (
              <div
                role="radiogroup"
                aria-label="Quem responde agora"
                className="bg-surface-muted grid grid-cols-3 gap-0.5 rounded-lg p-0.5"
              >
                {PENDING_OPTIONS.map((option) => {
                  const active = conversation.awaiting === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => !active && onSetAwaiting(option.value)}
                      className={cn(
                        "focus-visible:ring-ring/50 min-h-8 rounded-md px-2 text-xs transition-colors outline-none focus-visible:ring-2 pointer-coarse:min-h-10",
                        active
                          ? "bg-surface text-fg shadow-xs font-medium"
                          : "text-fg-muted hover:text-fg",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-fg-muted text-xs">
                {conversation.awaiting === "buyer"
                  ? "Aguardando você"
                  : conversation.awaiting === "supplier"
                    ? "Aguardando o fornecedor"
                    : "Ninguém pendente"}
              </p>
            )}
            <p className="text-fg-subtle text-xs">
              Muda sozinho: ao receber uma mensagem, a vez é sua; ao enviar, é do
              fornecedor.
            </p>
          </section>
        ) : null}

        <section className="space-y-2">
          <SectionTitle>Compra ligada</SectionTitle>
          {context === null ? (
            <Skeleton className="h-14 w-full rounded-lg" />
          ) : context.round || context.order ? (
            <div className="space-y-2">
              {context.round ? (
                <Link
                  href={`/compras/${context.round.id}`}
                  className="border-border hover:bg-surface-muted block rounded-lg border p-3 transition-colors"
                >
                  <span className="text-fg block truncate text-sm font-medium">
                    {context.round.title}
                  </span>
                  <span className="text-fg-muted text-xs">
                    Rodada · {context.round.statusLabel}
                  </span>
                </Link>
              ) : null}
              {context.order ? (
                <Link
                  href={`/pedidos/${context.order.id}`}
                  className="border-border hover:bg-surface-muted block rounded-lg border p-3 transition-colors"
                >
                  <span className="text-fg block text-sm font-medium">Pedido</span>
                  <span className="text-fg-muted text-xs">
                    {context.order.statusLabel}
                  </span>
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-fg-muted text-xs">
              Esta conversa não está ligada a uma rodada nem a um pedido.
            </p>
          )}
        </section>

        {canSend ? (
          <section className="space-y-2">
            <SectionTitle>Caixa</SectionTitle>
            {promotion ? (
              <p className="text-fg-muted text-xs">
                Em Promoções: as mensagens ficam guardadas, mas não geram
                pendência nem contam como não lidas.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() =>
                onSetCategory(promotion ? "operational" : "promotion")
              }
              className="border-border text-fg hover:bg-surface-muted focus-visible:ring-ring/50 inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
            >
              {promotion ? (
                <>
                  <BellRing className="size-3.5" aria-hidden /> Reativar conversa
                </>
              ) : (
                <>
                  <BellOff className="size-3.5" aria-hidden /> Mover para
                  Promoções
                </>
              )}
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
