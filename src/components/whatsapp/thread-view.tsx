"use client";

import {
  ArrowDown,
  ArrowLeft,
  CheckCheck,
  Info,
  MessageCircle,
  RotateCw,
} from "lucide-react";
import * as React from "react";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "@/components/whatsapp/composer";
import type { ChatContact } from "@/components/whatsapp/conversation-list";
import { ContactAvatar } from "@/components/whatsapp/contact-avatar";
import { formatPhone } from "@/components/whatsapp/details-panel";
import { MessageBubble } from "@/components/whatsapp/message-bubble";
import { buildThread, conversationTitle } from "@/features/whatsapp/inbox-logic";
import type {
  ConversationContext,
  InboxConversation,
  InboxMessage,
} from "@/features/whatsapp/types";
import { normalizeWhatsAppPhone } from "@/features/whatsapp/normalize";
import { cn } from "@/lib/utils";

export type ThreadState = {
  status: "loading" | "ready" | "error";
  messages: InboxMessage[];
  hasMore: boolean;
  context: ConversationContext | null;
  loadingEarlier: boolean;
};

const NEAR_BOTTOM_PX = 160;

function ThreadSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando a conversa"
      className="mx-auto flex max-w-3xl flex-col gap-3"
    >
      {[
        ["w-2/3", false],
        ["w-1/2", false],
        ["w-3/5", true],
        ["w-2/5", false],
        ["w-1/2", true],
      ].map(([width, mine], index) => (
        <Skeleton
          key={index}
          className={cn("h-11 rounded-2xl", width as string, mine && "self-end")}
        />
      ))}
    </div>
  );
}

export function ThreadView({
  conversation,
  thread,
  now,
  timeZone,
  canSend,
  canManage,
  connectionStatus,
  contacts,
  draft,
  onDraftChange,
  onSend,
  onRetry,
  onLoadEarlier,
  onReload,
  onBack,
  onToggleDetails,
  detailsOpen,
  onResolve,
  onLink,
  linkError,
}: {
  conversation: InboxConversation;
  thread: ThreadState | undefined;
  now: Date;
  timeZone: string;
  canSend: boolean;
  canManage: boolean;
  connectionStatus: string;
  contacts: ChatContact[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRetry: (message: InboxMessage) => void;
  onLoadEarlier: () => void;
  onReload: () => void;
  onBack: () => void;
  onToggleDetails: () => void;
  detailsOpen: boolean;
  onResolve: () => void;
  onLink: (contactId: string) => void;
  linkError: string | null;
}) {
  const title = conversationTitle(conversation);
  const scroller = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);
  const lastCount = React.useRef(0);
  const prepending = React.useRef<{ height: number; top: number } | null>(null);
  // Só existe enquanto a pessoa está lendo mensagens antigas; guarda quantas
  // já havia quando ela saiu do fim, e o que passa disso vira "mensagens novas".
  const [away, setAway] = React.useState<{ seen: number } | null>(null);

  const messages = thread?.messages;
  const ready = thread?.status === "ready";
  const count = messages?.length ?? 0;
  const days = React.useMemo(
    () => buildThread(messages ?? [], now, timeZone),
    [messages, now, timeZone],
  );
  const unseen = away ? Math.max(0, count - away.seen) : 0;

  function scrollToBottom(behavior: ScrollBehavior) {
    const element = scroller.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior });
  }

  // Conversa nova (ou recém-carregada): abre no fim, sem animação.
  React.useLayoutEffect(() => {
    if (!ready) return;
    stick.current = true;
    lastCount.current = 0;
    scrollToBottom("instant");
  }, [conversation.id, ready]);

  React.useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !ready) return;
    const restore = prepending.current;
    if (restore) {
      // Mensagens antigas entraram em cima: segura o que a pessoa estava lendo.
      element.scrollTop = element.scrollHeight - restore.height + restore.top;
      prepending.current = null;
    } else if (count > lastCount.current && lastCount.current > 0) {
      const last = messages?.[count - 1];
      if (stick.current || (last?.direction === "outbound" && last.clientId)) {
        stick.current = true;
        scrollToBottom("smooth");
      }
    }
    lastCount.current = count;
  }, [count, messages, ready]);

  // Imagem e áudio terminam de carregar depois de a conversa abrir e empurram o
  // fim para baixo: enquanto a pessoa está no fim, o fim a acompanha.
  React.useEffect(() => {
    const node = content.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) scrollToBottom("instant");
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    const near =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      NEAR_BOTTOM_PX;
    stick.current = near;
    setAway((current) => (near ? null : (current ?? { seen: count })));
  }

  function loadEarlier() {
    const element = scroller.current;
    if (element) {
      prepending.current = { height: element.scrollHeight, top: element.scrollTop };
    }
    onLoadEarlier();
  }

  const disabledReason =
    !canSend
      ? "Seu papel não permite enviar mensagens."
      : connectionStatus !== "connected"
        ? "O WhatsApp da empresa está desconectado."
        : null;
  const nativePhone = normalizeWhatsAppPhone(conversation.phone);
  const phone = formatPhone(conversation.phone);
  const awaitingYou = conversation.awaiting === "buyer";

  return (
    <section
      aria-label={`Conversa com ${title}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para as conversas"
          className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-9 shrink-0 place-items-center rounded-md lg:hidden pointer-coarse:size-11"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <ContactAvatar
          name={title}
          linked={Boolean(conversation.supplierId)}
          className="size-9 text-sm"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-fg truncate text-sm leading-tight font-semibold">
            {title}
          </h2>
          <p className="text-fg-subtle truncate text-xs tabular-nums">
            {[conversation.supplierId ? conversation.contactName : null, phone]
              .filter(Boolean)
              .join(" · ") || conversation.remoteJid}
          </p>
        </div>

        {canSend && awaitingYou ? (
          <button
            type="button"
            onClick={onResolve}
            title="Tirar da fila de quem espera você"
            className="border-border text-fg hover:bg-surface-muted focus-visible:ring-ring/50 inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            <span className="max-sm:sr-only">Resolvida</span>
          </button>
        ) : null}
        {nativePhone ? (
          <a
            href={`https://wa.me/${nativePhone}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir esta conversa no aplicativo do WhatsApp"
            title="Abrir no WhatsApp"
            className="text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:ring-ring/50 grid size-8 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2 pointer-coarse:size-11"
          >
            <MessageCircle className="size-4" aria-hidden />
          </a>
        ) : null}
        <button
          type="button"
          onClick={onToggleDetails}
          aria-pressed={detailsOpen}
          aria-label="Detalhes da conversa"
          title="Detalhes"
          className={cn(
            "text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:ring-ring/50 grid size-8 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2 xl:hidden pointer-coarse:size-11",
            detailsOpen && "bg-surface-muted text-fg",
          )}
        >
          <Info className="size-4" aria-hidden />
        </button>
      </header>

      {!conversation.supplierId && canSend ? (
        <div className="border-border bg-warning-soft shrink-0 border-b px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-fg min-w-0 flex-1 basis-56 text-sm">
              <span className="font-medium">Número sem fornecedor.</span>{" "}
              <span className="text-fg-muted">
                Ligue a um cadastro para usar os preços e combinados desta
                conversa em uma compra.
              </span>
            </p>
            <div className="w-full sm:w-72">
              <SearchableSelect
                id="whatsapp-link-contact"
                name="contact_id"
                className="w-full"
                options={contacts.map((contact) => ({
                  id: contact.id,
                  name: contact.label,
                  description: contact.detail ?? undefined,
                }))}
                placeholder="Escolha o fornecedor ou contato…"
                emptyMessage="Nenhum contato encontrado."
                onOptionSelected={(option) => onLink(option.id)}
              />
            </div>
          </div>
          {linkError ? (
            <p role="alert" className="text-destructive mt-1.5 text-xs">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={handleScroll}
          className="wa-chat-bg h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        >
          {!thread || thread.status === "loading" ? (
            <ThreadSkeleton />
          ) : thread.status === "error" ? (
            <div className="mx-auto mt-16 max-w-xs text-center">
              <p className="text-fg text-sm font-medium">
                Não foi possível abrir esta conversa
              </p>
              <p className="text-fg-muted mt-1 text-xs">
                Pode ser a conexão. Suas mensagens continuam guardadas.
              </p>
              <button
                type="button"
                onClick={onReload}
                className="border-border text-fg hover:bg-surface-muted mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium pointer-coarse:min-h-11"
              >
                <RotateCw className="size-3.5" aria-hidden /> Tentar de novo
              </button>
            </div>
          ) : (
            <div ref={content} className="mx-auto max-w-3xl">
              {thread.hasMore ? (
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    onClick={loadEarlier}
                    disabled={thread.loadingEarlier}
                    className="bg-surface text-fg-muted hover:text-fg border-border min-h-8 rounded-full border px-3 text-xs font-medium disabled:opacity-60 pointer-coarse:min-h-11"
                  >
                    {thread.loadingEarlier
                      ? "Carregando…"
                      : "Mostrar mensagens anteriores"}
                  </button>
                </div>
              ) : null}

              {days.length === 0 ? (
                <div className="mt-16 text-center">
                  <p className="text-fg text-sm font-medium">
                    Nenhuma mensagem ainda
                  </p>
                  <p className="text-fg-muted mt-1 text-xs">
                    {canSend
                      ? "Escreva abaixo para começar a conversa."
                      : "Quando o fornecedor escrever, a mensagem aparece aqui."}
                  </p>
                </div>
              ) : (
                days.map((day) => (
                  <section key={day.key} aria-label={day.label}>
                    <h3 className="sticky top-0 z-10 my-3 flex justify-center">
                      <span className="bg-surface text-fg-muted border-border rounded-full border px-3 py-0.5 text-xs font-normal shadow-xs first-letter:uppercase">
                        {day.label}
                      </span>
                    </h3>
                    {day.entries.map(({ message, startsRun }) => (
                      <MessageBubble
                        key={message.clientId ?? message.id}
                        message={message}
                        startsRun={startsRun}
                        timeZone={timeZone}
                        onRetry={onRetry}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          )}
        </div>

        {unseen > 0 && ready ? (
          <button
            type="button"
            onClick={() => {
              stick.current = true;
              setAway(null);
              scrollToBottom("smooth");
            }}
            className="bg-primary-solid text-primary-solid-fg absolute bottom-3 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium shadow-md pointer-coarse:min-h-11"
          >
            <ArrowDown className="size-3.5" aria-hidden />
            {unseen === 1 ? "1 mensagem nova" : `${unseen} mensagens novas`}
          </button>
        ) : null}
      </div>

      <Composer
        value={draft}
        onChange={onDraftChange}
        onSend={onSend}
        disabledReason={disabledReason}
        canManageConnection={canManage}
        focusKey={conversation.id}
      />
    </section>
  );
}
