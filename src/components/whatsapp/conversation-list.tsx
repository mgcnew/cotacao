"use client";

import { Clock3, MessageSquarePlus, Search, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ContactAvatar } from "@/components/whatsapp/contact-avatar";
import { stripMarkup } from "@/components/whatsapp/message-text";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  INBOX_FILTERS,
  conversationTitle,
  listTimeLabel,
  type InboxFilter,
} from "@/features/whatsapp/inbox-logic";
import type { InboxConversation } from "@/features/whatsapp/types";
import { cn } from "@/lib/utils";

export type ChatContact = {
  id: string;
  label: string;
  detail: string | null;
};

const FILTER_LABEL: Record<InboxFilter, { short: string; long: string }> = {
  open: { short: "Abertas", long: "Conversas abertas" },
  unread: { short: "Não lidas", long: "Conversas com mensagens não lidas" },
  waiting_supplier: { short: "Fornecedor", long: "Aguardando o fornecedor" },
  waiting_buyer: { short: "Você", long: "Aguardando você responder" },
  promotions: { short: "Promoções", long: "Promoções e avisos em massa" },
};

function RowView({
  conversation,
  selected,
  now,
  timeZone,
  onSelect,
  onPrefetch,
}: {
  conversation: InboxConversation;
  selected: boolean;
  now: Date;
  timeZone: string;
  onSelect: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  const title = conversationTitle(conversation);
  const unread = conversation.unread > 0;
  const preview = conversation.lastPreview
    ? stripMarkup(conversation.lastPreview)
    : "Conversa iniciada";
  const promotion = conversation.category === "promotion";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        onPointerEnter={() => onPrefetch(conversation.id)}
        onFocus={() => onPrefetch(conversation.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "hover:bg-surface-muted focus-visible:ring-ring/50 flex min-h-[4.25rem] w-full items-start gap-3 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
          selected && "bg-primary-soft hover:bg-primary-soft",
        )}
      >
        <ContactAvatar name={title} linked={Boolean(conversation.supplierId)} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline justify-between gap-2">
            <span
              className={cn(
                "text-fg min-w-0 flex-1 truncate text-sm",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {title}
            </span>
            {conversation.lastMessageAt ? (
              <time
                dateTime={conversation.lastMessageAt}
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  unread ? "text-primary font-medium" : "text-fg-subtle",
                )}
              >
                {listTimeLabel(conversation.lastMessageAt, now, timeZone)}
              </time>
            ) : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                unread ? "text-fg" : "text-fg-muted",
              )}
            >
              {conversation.lastDirection === "outbound" ? (
                <span className="text-fg-subtle">Você: </span>
              ) : null}
              {preview}
            </span>
            {unread ? (
              <span className="bg-primary-solid text-primary-solid-fg grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs leading-none font-semibold tabular-nums">
                {conversation.unread > 99 ? "99+" : conversation.unread}
                <span className="sr-only"> não lidas</span>
              </span>
            ) : null}
          </span>
          {!promotion && conversation.awaiting ? (
            <span
              className={cn(
                "mt-1 flex items-center gap-1 text-xs",
                conversation.awaiting === "buyer"
                  ? "text-warning font-medium"
                  : "text-fg-subtle",
              )}
            >
              {conversation.awaiting === "buyer" ? (
                <>
                  <span aria-hidden className="bg-warning size-1.5 rounded-full" />
                  Aguardando você
                </>
              ) : (
                <>
                  <Clock3 className="size-3" aria-hidden />
                  Aguardando fornecedor
                </>
              )}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Uma linha só se redesenha quando a conversa dela muda: a lista tem centenas. */
const Row = React.memo(RowView);

export function ConversationList({
  conversations,
  totalLoaded,
  selectedId,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  counts,
  now,
  timeZone,
  connectionStatus,
  live,
  contacts,
  canStartChat,
  starting,
  startError,
  onStartChat,
  onSelect,
  onPrefetch,
}: {
  conversations: InboxConversation[];
  totalLoaded: number;
  selectedId: string | null;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  counts: Record<InboxFilter, number>;
  now: Date;
  timeZone: string;
  connectionStatus: string;
  live: boolean;
  contacts: ChatContact[];
  canStartChat: boolean;
  starting: boolean;
  startError: string | null;
  onStartChat: (contactId: string) => void;
  onSelect: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const connected = connectionStatus === "connected";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border shrink-0 space-y-3 border-b px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-fg min-w-0 flex-1 text-base font-semibold tracking-tight">
            Conversas
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
              connected
                ? "bg-success-soft text-success"
                : "bg-destructive-soft text-destructive",
            )}
            title={
              connected && !live
                ? "Reconectando as atualizações ao vivo…"
                : undefined
            }
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full bg-current",
                connected && !live && "animate-pulse opacity-60",
              )}
            />
            {connected ? (live ? "Ao vivo" : "Reconectando") : "Desconectado"}
          </span>
          {canStartChat ? (
            <button
              type="button"
              aria-expanded={chooserOpen}
              aria-label="Nova conversa"
              onClick={() => setChooserOpen((open) => !open)}
              className={cn(
                "text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:ring-ring/50 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-2 pointer-coarse:size-11",
                chooserOpen && "bg-surface-muted text-fg",
              )}
            >
              <MessageSquarePlus className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {!connected ? (
          <p className="text-fg-muted text-xs">
            O número da empresa está desconectado: dá para ler o histórico, mas
            não enviar.{" "}
            <Link
              href="/configuracoes?aba=whatsapp"
              className="text-primary font-medium hover:underline"
            >
              Reconectar
            </Link>
          </p>
        ) : null}

        {chooserOpen && canStartChat ? (
          <div className="space-y-1.5">
            <SearchableSelect
              id="whatsapp-new-chat"
              name="contact_id"
              focusKey="open"
              className="w-full"
              options={contacts.map((contact) => ({
                id: contact.id,
                name: contact.label,
                description: contact.detail ?? undefined,
              }))}
              placeholder="Fornecedor ou contato…"
              emptyMessage="Nenhum contato com WhatsApp."
              onOptionSelected={(option) => {
                onStartChat(option.id);
                setChooserOpen(false);
              }}
            />
            {starting ? (
              <p className="text-fg-muted text-xs" role="status">
                Abrindo a conversa…
              </p>
            ) : null}
          </div>
        ) : null}
        {startError ? (
          <p role="alert" className="text-destructive text-xs">
            {startError}
          </p>
        ) : null}

        <div className="relative">
          <Search
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem"
            aria-label="Buscar conversa"
            className="border-input bg-input-bg placeholder:text-fg-subtle focus:border-ring focus:ring-ring/30 h-9 w-full rounded-lg border pr-8 pl-8 text-sm outline-none focus:ring-3 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => onSearchChange("")}
              className="text-fg-subtle hover:text-fg absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md pointer-coarse:size-9"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <div
          role="group"
          aria-label="Filtrar conversas"
          className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {INBOX_FILTERS.map(({ value }) => {
            const active = filter === value;
            const count = counts[value];
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                aria-label={`${FILTER_LABEL[value].long}: ${count}`}
                title={FILTER_LABEL[value].long}
                onClick={() => onFilterChange(value)}
                className={cn(
                  "focus-visible:ring-ring/50 inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 pointer-coarse:min-h-10",
                  active
                    ? "bg-primary-solid text-primary-solid-fg font-medium"
                    : "bg-surface-muted text-fg-muted hover:text-fg",
                )}
              >
                {FILTER_LABEL[value].short}
                {count > 0 ? (
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "opacity-85" : "text-fg-subtle",
                    )}
                  >
                    {count > 999 ? "999+" : count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain sm:overscroll-contain">
        {conversations.length > 0 ? (
          <ul className="divide-border divide-y">
            {conversations.map((conversation) => (
              <Row
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                now={now}
                timeZone={timeZone}
                onSelect={onSelect}
                onPrefetch={onPrefetch}
              />
            ))}
          </ul>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-fg text-sm font-medium">
              {search
                ? `Nada encontrado para “${search}”`
                : totalLoaded === 0
                  ? "Nenhuma conversa ainda"
                  : "Nenhuma conversa neste filtro"}
            </p>
            <p className="text-fg-muted mx-auto mt-1 max-w-[16rem] text-xs">
              {search
                ? "A busca olha nome, telefone e a última mensagem."
                : totalLoaded === 0
                  ? "Quando um fornecedor escrever, ou quando você enviar uma cotação, a conversa aparece aqui."
                  : "Troque o filtro acima para ver outras conversas."}
            </p>
            {search || filter !== "open" ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  onFilterChange("open");
                }}
                className="text-primary mt-3 text-xs font-medium hover:underline"
              >
                Ver todas as abertas
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
