"use client";

import { MessageCircle, X } from "lucide-react";
import * as React from "react";

import {
  ConversationList,
  type ChatContact,
} from "@/components/whatsapp/conversation-list";
import { DetailsPanel } from "@/components/whatsapp/details-panel";
import { ThreadView, type ThreadState } from "@/components/whatsapp/thread-view";
import * as api from "@/components/whatsapp/inbox-api";
import {
  filterCounts,
  foldSearch,
  matchesFilter,
  matchesSearch,
  parseFilter,
  previewOf,
  settleMessage,
  sortConversations,
  upsertConversation,
  upsertMessage,
  type InboxFilter,
} from "@/features/whatsapp/inbox-logic";
import {
  toInboxConversation,
  toInboxMessage,
  type AwaitingSide,
  type ConversationRow,
  type ConversationSnapshot,
  type InboxConversation,
  type InboxMessage,
  type MessageRow,
} from "@/features/whatsapp/types";
import { loadBrowserClient } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string;
  initialFilter: InboxFilter;
  timeZone: string;
  initialConversations: InboxConversation[];
  initialSelectedId: string | null;
  initialSnapshot: ConversationSnapshot | null;
  contacts: ChatContact[];
  connectionStatus: string;
  canSend: boolean;
  canManage: boolean;
};

const HOVER_PREFETCH_MS = 140;
const STALE_AFTER_HIDDEN_MS = 15_000;

function readyThread(snapshot: ConversationSnapshot): ThreadState {
  return {
    status: "ready",
    messages: snapshot.messages,
    hasMore: snapshot.hasMore,
    context: snapshot.context,
    loadingEarlier: false,
  };
}

function loadingThread(): ThreadState {
  return {
    status: "loading",
    messages: [],
    hasMore: false,
    context: null,
    loadingEarlier: false,
  };
}

/** Atualiza a URL sem navegar: o Next acompanha `history` e o `useSearchParams` reage. */
function writeUrl(
  changes: Record<string, string | null>,
  mode: "push" | "replace",
) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const next = `${url.pathname}${url.search}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

export function WhatsAppInbox({
  companyId,
  initialFilter,
  timeZone,
  initialConversations,
  initialSelectedId,
  initialSnapshot,
  contacts,
  connectionStatus,
  canSend,
  canManage,
}: Props) {
  // Seleção e filtro são estado da tela, só ESPELHADOS na URL. Ler a URL de
  // volta pelo roteador do Next custava caro: o histórico dele passa pela mesma
  // fila das Server Actions, e trocar de conversa esperava na fila qualquer
  // carga em andamento — mesmo com a conversa já na memória.
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId);
  const [filter, setFilter] = React.useState<InboxFilter>(initialFilter);

  const [conversations, setConversations] =
    React.useState<InboxConversation[]>(initialConversations);
  const [threads, setThreads] = React.useState<Record<string, ThreadState>>(
    () =>
      initialSelectedId && initialSnapshot
        ? { [initialSelectedId]: readyThread(initialSnapshot) }
        : {},
  );
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState("");
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const [notice, setNotice] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const conversationsRef = React.useRef(conversations);
  const selectedRef = React.useRef(selectedId);
  const threadsRef = React.useRef(threads);
  const inflight = React.useRef(new Set<string>());
  // Mensagens que chegaram enquanto a conversa ainda carregava: sem isto, a
  // resposta do servidor (lida um instante antes) as deixaria de fora.
  const buffered = React.useRef(new Map<string, InboxMessage[]>());
  const sendQueue = React.useRef<Promise<unknown>>(Promise.resolve());
  const hadDrop = React.useRef(false);
  const hiddenAt = React.useRef<number | null>(null);
  const prefetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRefreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  React.useEffect(() => {
    conversationsRef.current = conversations;
    selectedRef.current = selectedId;
    threadsRef.current = threads;
  });

  // O relógio da tela (rótulos "Hoje", "Ontem"): um tique por minuto basta.
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* ───────────── carregar conversa ───────────── */

  const loadThread = React.useCallback(
    async (id: string, options: { silent?: boolean } = {}) => {
      if (inflight.current.has(id)) return;
      const conversation = conversationsRef.current.find((item) => item.id === id);
      if (!conversation) return;
      inflight.current.add(id);
      if (!options.silent) {
        setThreads((current) =>
          current[id] ? current : { ...current, [id]: loadingThread() },
        );
      }
      const result = await api.loadConversation({
        conversationId: id,
        roundId: conversation.roundId,
        orderId: conversation.orderId,
      });
      inflight.current.delete(id);

      if (!result || !result.ok) {
        setThreads((current) =>
          current[id]?.status === "ready"
            ? current
            : { ...current, [id]: { ...loadingThread(), status: "error" } },
        );
        return;
      }
      const early = buffered.current.get(id) ?? [];
      buffered.current.delete(id);
      setThreads((current) => {
        const existing = current[id];
        const server = result.snapshot.messages;
        const firstServer = server[0]?.occurredAt;
        // Páginas antigas que a pessoa já abriu e mensagens ainda sem
        // confirmação não podem sumir numa recarga silenciosa.
        const older =
          existing && firstServer
            ? existing.messages.filter(
                (message) => !message.clientId && message.occurredAt < firstServer,
              )
            : [];
        const local = (existing?.messages ?? []).filter(
          (message) => message.clientId !== undefined,
        );
        let list = [...older, ...server];
        for (const message of [...early, ...local]) list = upsertMessage(list, message);
        return {
          ...current,
          [id]: {
            status: "ready",
            messages: list,
            hasMore: older.length > 0 ? (existing?.hasMore ?? false) : result.snapshot.hasMore,
            context: result.snapshot.context,
            loadingEarlier: false,
          },
        };
      });
    },
    [],
  );

  const loadEarlier = React.useCallback(async (id: string) => {
    const first = threadsRef.current[id]?.messages.find((message) => !message.clientId);
    if (!first) return;
    setThreads((current) =>
      current[id]
        ? { ...current, [id]: { ...current[id], loadingEarlier: true } }
        : current,
    );
    const result = await api.loadEarlier({
      conversationId: id,
      before: first.occurredAt,
    });
    setThreads((current) => {
      const thread = current[id];
      if (!thread) return current;
      if (!result || !result.ok) {
        return { ...current, [id]: { ...thread, loadingEarlier: false } };
      }
      let list = thread.messages;
      for (const message of result.messages) list = upsertMessage(list, message);
      return {
        ...current,
        [id]: { ...thread, messages: list, hasMore: result.hasMore, loadingEarlier: false },
      };
    });
  }, []);

  /* ───────────── não lidas ───────────── */

  const markRead = React.useCallback((id: string) => {
    if (readTimers.current.has(id)) return;
    setConversations((current) =>
      current.map((item) => (item.id === id ? { ...item, unread: 0 } : item)),
    );
    // Um pequeno intervalo agrupa uma rajada de mensagens numa só gravação.
    readTimers.current.set(
      id,
      setTimeout(() => {
        readTimers.current.delete(id);
        void api.markRead(id);
      }, 350),
    );
  }, []);

  const selected = selectedId
    ? (conversations.find((item) => item.id === selectedId) ?? null)
    : null;
  const selectedUnread = selected?.unread ?? 0;

  // Abrir uma conversa (clique, link direto ou "voltar"): carrega, de novo e em
  // silêncio quando já havia cópia, e tira o "não lida" se a aba está à vista.
  React.useEffect(() => {
    if (!selectedId) return;
    // Fora do corpo do efeito: a carga atualiza o estado ao terminar, e é isso
    // que o React quer ver separado da sincronização com a URL.
    const timer = setTimeout(() => void loadThread(selectedId, { silent: true }), 0);
    return () => clearTimeout(timer);
  }, [selectedId, loadThread]);

  React.useEffect(() => {
    if (!selectedId || !canSend || selectedUnread === 0) return;
    if (document.visibilityState !== "visible") return;
    markRead(selectedId);
  }, [selectedId, selectedUnread, canSend, markRead]);

  /* ───────────── tempo real ───────────── */

  const refreshList = React.useCallback(async () => {
    const result = await api.refreshInbox();
    if (result?.ok) {
      setConversations((current) => {
        // Conversas de abas anteriores continuam na lista se o servidor não as devolveu.
        const known = new Set(result.conversations.map((item) => item.id));
        return sortConversations([
          ...result.conversations,
          ...current.filter((item) => !known.has(item.id)),
        ]);
      });
    }
  }, []);

  const resync = React.useCallback(() => {
    void refreshList();
    const id = selectedRef.current;
    if (id) void loadThread(id, { silent: true });
  }, [refreshList, loadThread]);

  React.useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void loadBrowserClient().then((supabase) => {
      if (cancelled) return;
      const channel = supabase
        .channel(`whatsapp-inbox:${companyId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "whatsapp_conversations",
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string }).id;
              if (id) {
                setConversations((current) => current.filter((item) => item.id !== id));
              }
              return;
            }
            const row = payload.new as ConversationRow;
            const isKnown = conversationsRef.current.some((item) => item.id === row.id);
            setConversations((current) =>
              upsertConversation(current, toInboxConversation(row)),
            );
            // O Realtime não faz o join com o nome do fornecedor: conversa nova
            // pede uma recarga curta para trazê-lo.
            if (!isKnown && row.supplier_id) {
              if (listRefreshTimer.current) clearTimeout(listRefreshTimer.current);
              listRefreshTimer.current = setTimeout(() => void refreshList(), 400);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "whatsapp_messages",
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new as MessageRow;
            const message = toInboxMessage(row);
            setThreads((current) => {
              const thread = current[message.conversationId];
              if (thread?.status === "ready") {
                return {
                  ...current,
                  [message.conversationId]: {
                    ...thread,
                    messages: upsertMessage(thread.messages, message),
                  },
                };
              }
              if (inflight.current.has(message.conversationId)) {
                const waiting = buffered.current.get(message.conversationId) ?? [];
                buffered.current.set(message.conversationId, [...waiting, message]);
              }
              return current;
            });
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setLive(true);
            // Voltou depois de cair: o que passou nesse intervalo não veio pelo canal.
            if (hadDrop.current) resync();
            hadDrop.current = false;
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setLive(false);
            hadDrop.current = true;
          }
        });
      cleanup = () => void supabase.removeChannel(channel);
    });

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      setNow(new Date());
      if (away > STALE_AFTER_HIDDEN_MS) resync();
      const id = selectedRef.current;
      const conversation = conversationsRef.current.find((item) => item.id === id);
      if (id && conversation && conversation.unread > 0 && canSend) markRead(id);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", resync);

    const timers = readTimers.current;
    return () => {
      cancelled = true;
      cleanup?.();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", resync);
      if (listRefreshTimer.current) clearTimeout(listRefreshTimer.current);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [companyId, canSend, markRead, refreshList, resync]);

  /* ───────────── navegação ───────────── */

  const select = React.useCallback((id: string) => {
    setNotice(null);
    setLinkError(null);
    setDetailsOpen(false);
    setSelectedId(id);
    writeUrl({ conversa: id }, "push");
  }, []);

  const back = React.useCallback(() => {
    setDetailsOpen(false);
    setSelectedId(null);
    writeUrl({ conversa: null }, "push");
  }, []);

  const changeFilter = React.useCallback((next: InboxFilter) => {
    setFilter(next);
    writeUrl({ filtro: next === "open" ? null : next }, "replace");
  }, []);

  // "Voltar" e "avançar" do navegador: a URL manda e a tela acompanha.
  React.useEffect(() => {
    function onPop() {
      const query = new URLSearchParams(window.location.search);
      setSelectedId(query.get("conversa") || null);
      setFilter(parseFilter(query.get("filtro")));
      setDetailsOpen(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const prefetch = React.useCallback(
    (id: string) => {
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
      prefetchTimer.current = setTimeout(() => {
        if (inflight.current.size >= 3) return;
        const already = threadsRef.current[id];
        if (!already) void loadThread(id);
      }, HOVER_PREFETCH_MS);
    },
    [loadThread],
  );

  React.useEffect(() => {
    if (!detailsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen]);

  /* ───────────── envio ───────────── */

  const patchConversation = React.useCallback(
    (id: string, patch: Partial<InboxConversation>) => {
      setConversations((current) =>
        sortConversations(
          current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        ),
      );
    },
    [],
  );

  const patchThread = React.useCallback(
    (id: string, change: (messages: InboxMessage[]) => InboxMessage[]) => {
      setThreads((current) => {
        const thread = current[id];
        return thread
          ? { ...current, [id]: { ...thread, messages: change(thread.messages) } }
          : current;
      });
    },
    [],
  );

  const sendText = React.useCallback(
    (conversationId: string, text: string, retryOf?: InboxMessage) => {
      // `randomUUID` só existe em contexto seguro (https ou localhost); abrir o
      // app pelo IP da rede no celular, em desenvolvimento, não o tem.
      const clientId = `tmp-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
      const sentAt = new Date().toISOString();
      const provisional: InboxMessage = {
        id: clientId,
        clientId,
        conversationId,
        direction: "outbound",
        type: "text",
        body: text,
        hasMedia: false,
        fileName: null,
        status: "sending",
        occurredAt: sentAt,
        error: null,
        externalId: null,
      };
      setNotice(null);
      patchThread(conversationId, (messages) =>
        upsertMessage(
          retryOf ? messages.filter((item) => item.id !== retryOf.id) : messages,
          provisional,
        ),
      );
      const before = conversationsRef.current.find((item) => item.id === conversationId);
      patchConversation(conversationId, {
        lastMessageAt: sentAt,
        lastPreview: previewOf(provisional),
        lastDirection: "outbound",
        awaiting: "supplier",
        category: "operational",
      });

      // Uma por vez, na ordem em que foram escritas: duas mensagens seguidas
      // não podem chegar ao fornecedor trocadas.
      sendQueue.current = sendQueue.current.then(async () => {
        const result = await api.sendMessage({
          conversationId,
          text,
          retryOfId: retryOf && !retryOf.clientId ? retryOf.id : undefined,
        });

        if (result?.message) {
          const confirmed = result.message;
          patchThread(conversationId, (messages) =>
            settleMessage(messages, clientId, confirmed),
          );
        } else {
          const reason = result && !result.ok
            ? result.error
            : "Sem conexão com o servidor. Tente de novo.";
          patchThread(conversationId, (messages) =>
            messages.map((item) =>
              item.clientId === clientId
                ? { ...item, status: "failed", error: reason }
                : item,
            ),
          );
        }

        // A mensagem não saiu: a lista volta ao que mostrava, a menos que algo
        // mais novo (uma resposta do fornecedor) já tenha mexido na conversa.
        if (!result?.ok && before) {
          setConversations((current) =>
            sortConversations(
              current.map((item) =>
                item.id === conversationId && item.lastMessageAt === sentAt
                  ? {
                      ...item,
                      lastMessageAt: before.lastMessageAt,
                      lastPreview: before.lastPreview,
                      lastDirection: before.lastDirection,
                      awaiting: before.awaiting,
                      category: before.category,
                    }
                  : item,
              ),
            ),
          );
        }
      });
    },
    [patchConversation, patchThread],
  );

  const handleSend = React.useCallback(() => {
    if (!selectedId) return;
    const text = (drafts[selectedId] ?? "").trim();
    if (!text) return;
    setDrafts((current) => ({ ...current, [selectedId]: "" }));
    sendText(selectedId, text);
  }, [drafts, selectedId, sendText]);

  const handleRetry = React.useCallback(
    (message: InboxMessage) => {
      if (message.body) sendText(message.conversationId, message.body, message);
    },
    [sendText],
  );

  /* ───────────── ajustes da conversa ───────────── */

  const setAwaiting = React.useCallback(
    async (id: string, side: AwaitingSide | null) => {
      const previous = conversationsRef.current.find((item) => item.id === id)?.awaiting ?? null;
      patchConversation(id, { awaiting: side });
      const result = await api.setAwaiting(id, side);
      if (!result?.ok) {
        patchConversation(id, { awaiting: previous });
        setNotice(result && !result.ok ? result.error : "Não foi possível atualizar a conversa.");
      }
    },
    [patchConversation],
  );

  const setCategory = React.useCallback(
    async (id: string, category: InboxConversation["category"]) => {
      const before = conversationsRef.current.find((item) => item.id === id);
      if (!before) return;
      patchConversation(id, {
        category,
        ...(category === "promotion" ? { unread: 0, awaiting: null } : {}),
      });
      const result = await api.setCategory(id, category);
      if (!result?.ok) {
        patchConversation(id, {
          category: before.category,
          unread: before.unread,
          awaiting: before.awaiting,
        });
        setNotice(result && !result.ok ? result.error : "Não foi possível mover a conversa.");
      }
    },
    [patchConversation],
  );

  const link = React.useCallback(
    async (id: string, contactId: string) => {
      setLinkError(null);
      const result = await api.linkContact(id, contactId);
      if (!result.ok || !result.linked) {
        setLinkError(result.ok ? "Não foi possível ligar ao fornecedor." : result.error);
        return;
      }
      const { linked } = result;
      patchConversation(id, {
        supplierId: linked.supplierId,
        supplierContactId: linked.contactId,
        supplierName: linked.supplierName,
        contactName: linked.contactName,
        displayName: linked.contactName,
        phone: linked.phone || null,
      });
    },
    [patchConversation],
  );

  const startChat = React.useCallback(
    async (contactId: string) => {
      setStarting(true);
      setStartError(null);
      const result = await api.openConversation(contactId);
      setStarting(false);
      if (!result?.ok) {
        setStartError(result && !result.ok ? result.error : "Não foi possível abrir a conversa.");
        return;
      }
      setConversations((current) => upsertConversation(current, result.conversation));
      setSearch("");
      const changes: Record<string, string | null> = { conversa: result.conversation.id };
      // Conversa recém-aberta não pode nascer escondida pelo filtro em uso.
      if (!matchesFilter(result.conversation, filter)) {
        changes.filtro = null;
        setFilter("open");
      }
      setSelectedId(result.conversation.id);
      writeUrl(changes, "push");
    },
    [filter],
  );

  /* ───────────── derivados ───────────── */

  const needle = foldSearch(search);
  const visible = React.useMemo(
    () =>
      conversations.filter(
        (item) => matchesFilter(item, filter) && matchesSearch(item, needle),
      ),
    [conversations, filter, needle],
  );
  const counts = React.useMemo(() => filterCounts(conversations), [conversations]);
  const thread = selectedId ? threads[selectedId] : undefined;

  return (
    <div
      className={cn(
        "border-border bg-surface relative grid min-h-0 min-w-0 flex-1 overflow-hidden",
        "max-lg:rounded-none max-lg:border-0 lg:rounded-xl lg:border",
        "lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_19rem]",
      )}
    >
      <aside
        className={cn(
          "border-border min-h-0 min-w-0 flex-col lg:border-r",
          selected ? "hidden lg:flex" : "flex",
        )}
      >
        <ConversationList
          conversations={visible}
          totalLoaded={conversations.length}
          selectedId={selectedId}
          filter={filter}
          onFilterChange={changeFilter}
          search={search}
          onSearchChange={setSearch}
          counts={counts}
          now={now}
          timeZone={timeZone}
          connectionStatus={connectionStatus}
          live={live}
          contacts={contacts}
          canStartChat={canSend}
          starting={starting}
          startError={startError}
          onStartChat={startChat}
          onSelect={select}
          onPrefetch={prefetch}
        />
      </aside>

      <div
        className={cn(
          "relative min-h-0 min-w-0 flex-col",
          selected ? "flex" : "hidden lg:flex",
        )}
      >
        {selected ? (
          <>
            {notice ? (
              <p
                role="alert"
                className="bg-destructive-soft text-destructive flex shrink-0 items-center gap-2 px-4 py-2 text-xs"
              >
                <span className="flex-1">{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Dispensar aviso"
                  className="grid size-6 place-items-center rounded-md hover:bg-destructive/10 pointer-coarse:size-9"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </p>
            ) : null}
            <ThreadView
              key={selected.id}
              conversation={selected}
              thread={thread}
              now={now}
              timeZone={timeZone}
              canSend={canSend}
              canManage={canManage}
              connectionStatus={connectionStatus}
              contacts={contacts}
              draft={drafts[selected.id] ?? ""}
              onDraftChange={(value) =>
                setDrafts((current) => ({ ...current, [selected.id]: value }))
              }
              onSend={handleSend}
              onRetry={handleRetry}
              onLoadEarlier={() => void loadEarlier(selected.id)}
              onReload={() => void loadThread(selected.id)}
              onBack={back}
              onToggleDetails={() => setDetailsOpen((open) => !open)}
              detailsOpen={detailsOpen}
              onResolve={() => void setAwaiting(selected.id, null)}
              onLink={(contactId) => void link(selected.id, contactId)}
              linkError={linkError}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div className="max-w-xs">
              <span className="bg-primary-soft text-primary mx-auto grid size-12 place-items-center rounded-2xl">
                <MessageCircle className="size-6" aria-hidden />
              </span>
              <h2 className="text-fg mt-4 text-base font-semibold">
                {counts.waiting_buyer > 0
                  ? counts.waiting_buyer === 1
                    ? "1 conversa espera você"
                    : `${counts.waiting_buyer} conversas esperam você`
                  : "Nenhuma conversa espera você"}
              </h2>
              <p className="text-fg-muted mt-1 text-sm">
                {counts.waiting_buyer > 0
                  ? "Comece por quem já respondeu: é onde a compra está parada."
                  : "Escolha uma conversa ao lado para ler o histórico e responder."}
              </p>
              {counts.waiting_buyer > 0 && filter !== "waiting_buyer" ? (
                <button
                  type="button"
                  onClick={() => changeFilter("waiting_buyer")}
                  className="bg-primary-solid text-primary-solid-fg mt-4 inline-flex min-h-9 items-center rounded-md px-3.5 text-sm font-medium pointer-coarse:min-h-11"
                >
                  Ver quem espera você
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <aside className="border-border hidden min-h-0 border-l xl:block">
        {selected ? (
          <DetailsPanel
            conversation={selected}
            context={thread?.status === "ready" ? thread.context : null}
            canSend={canSend}
            onSetAwaiting={(side) => void setAwaiting(selected.id, side)}
            onSetCategory={(category) => void setCategory(selected.id, category)}
          />
        ) : null}
      </aside>

      {selected && detailsOpen ? (
        <div className="xl:hidden">
          <button
            type="button"
            aria-label="Fechar detalhes"
            tabIndex={-1}
            onClick={() => setDetailsOpen(false)}
            className="absolute inset-0 z-20 bg-black/30"
          />
          <aside className="bg-surface border-border absolute inset-y-0 right-0 z-30 w-[min(20rem,100%)] border-l shadow-xl">
            <DetailsPanel
              conversation={selected}
              context={thread?.status === "ready" ? thread.context : null}
              canSend={canSend}
              onSetAwaiting={(side) => void setAwaiting(selected.id, side)}
              onSetCategory={(category) => void setCategory(selected.id, category)}
              onClose={() => setDetailsOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
