import {
  AlertCircle,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  ImageIcon,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ScrollMessagesToBottom, WhatsAppLiveUpdates } from "@/components/whatsapp/live-updates";
import { WhatsAppMessageComposer } from "@/components/whatsapp/message-composer";
import { WhatsAppMetricsPanel } from "@/components/whatsapp/metrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  linkWhatsAppConversationAction,
  setWhatsAppConversationCategoryAction,
  setWhatsAppConversationStateAction,
  startWhatsAppConversationAction,
  verifyWhatsAppConnectionAction,
} from "@/features/whatsapp/actions";
import {
  getWhatsAppConnection,
  getWhatsAppContext,
  getWhatsAppConversation,
  getWhatsAppMetrics,
  listWhatsAppContacts,
  listWhatsAppConversations,
  listWhatsAppMessages,
} from "@/features/whatsapp/queries";
import { normalizeWhatsAppPhone } from "@/features/whatsapp/normalize";
import { getCompany } from "@/features/company/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function connectionLabel(status: string) {
  return ({ connected: "Conectado", connecting: "Conectando", disconnected: "Desconectado", error: "Com erro", unknown: "Não verificado" } as Record<string, string>)[status] ?? status;
}

function messageTypeLabel(type: string) {
  return ({ image: "Imagem", document: "Documento", audio: "Áudio", video: "Vídeo", contact: "Contato", location: "Localização", reaction: "Reação" } as Record<string, string>)[type] ?? "Mensagem não suportada";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "failed") return <AlertCircle className="size-3 text-danger" aria-label="Falhou" />;
  if (["read", "played"].includes(status)) return <CheckCheck className="size-3 text-sky-500" aria-label="Lida" />;
  if (status === "delivered") return <CheckCheck className="size-3" aria-label="Entregue" />;
  if (["sent"].includes(status)) return <Check className="size-3" aria-label="Enviada" />;
  return <Clock3 className="size-3" aria-label="Pendente" />;
}

export default async function WhatsAppPage({ searchParams }: { searchParams: SearchParams }) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("purchase_round.view")) redirect("/dashboard");

  const params = await searchParams;
  const selectedId = param(params.conversa);
  const filter = param(params.filtro) || "open";
  const search = param(params.busca);
  const errorMessage = param(params.erro);
  const requestedPeriod = Number(param(params.periodo));
  const metricsDays = requestedPeriod === 7 || requestedPeriod === 90 ? requestedPeriod : 30;
  const canSend = permissions.has("purchase_round.send");
  const canManage = permissions.has("role.manage");
  const [connection, companyDetails] = await Promise.all([
    getWhatsAppConnection(company.companyId),
    getCompany(company.companyId),
  ]);
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: companyDetails.timezone,
  });
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: companyDetails.timezone,
  });

  if (!connection) {
    return (
      <div className="w-full">
        <PageHeader title="WhatsApp Compras" description="Conversas operacionais com fornecedores, ligadas às suas compras." />
        <div className="border-border bg-surface mx-auto mt-12 max-w-xl rounded-2xl border p-8 text-center shadow-sm">
          <span className="bg-primary/10 text-primary mx-auto mb-4 grid size-12 place-items-center rounded-2xl">
            <MessageCircle className="size-6" aria-hidden />
          </span>
          <h2 className="text-fg text-lg font-semibold">Ativar a caixa de compras</h2>
          <p className="text-fg-muted mx-auto mt-2 max-w-md text-sm">
            Conecte o número da empresa por QR Code nas Configurações. Nenhuma chave da Evolution será enviada ao navegador.
          </p>
          {errorMessage ? <p className="text-danger mt-4 text-sm">{errorMessage}</p> : null}
          {canManage ? (
            <Button asChild className="mt-6"><Link href="/configuracoes?aba=whatsapp">Configurar WhatsApp</Link></Button>
          ) : (
            <p className="text-fg-subtle mt-5 text-xs">Um administrador precisa realizar a ativação inicial.</p>
          )}
        </div>
      </div>
    );
  }

  const [conversations, contacts, selected, metrics] = await Promise.all([
    listWhatsAppConversations(company.companyId, filter, search),
    canSend ? listWhatsAppContacts(company.companyId) : Promise.resolve([]),
    selectedId ? getWhatsAppConversation(company.companyId, selectedId) : Promise.resolve(null),
    getWhatsAppMetrics(company.companyId, metricsDays),
  ]);
  const [messages, context] = selected
    ? await Promise.all([
        listWhatsAppMessages(company.companyId, selected.id),
        getWhatsAppContext(company.companyId, selected.purchase_round_id, selected.order_id),
      ])
    : [[], { round: null, order: null }];
  const nativeWhatsAppPhone = selected
    ? normalizeWhatsAppPhone(
        selected.normalized_phone ?? selected.supplier_contacts?.whatsapp,
      )
    : null;

  return (
    <div
      data-mobile-scroll="contained"
      className={cn(
        "flex min-h-0 w-full flex-col max-md:h-full",
        selected && "md:max-lg:-mx-6 md:max-lg:-my-6 md:max-lg:h-[calc(100dvh-3.5rem)] md:max-lg:w-[calc(100%+3rem)]",
      )}
    >
      <div
        className={cn(
          "max-md:px-4 max-md:pt-6",
          selected && "max-lg:hidden",
        )}
      >
        <PageHeader
          title="WhatsApp Compras"
          description="Só fornecedores e assuntos que ajudam a compra a avançar."
          action={
          <div className="flex items-center gap-2">
            <Badge variant={connection.status === "connected" ? "default" : "destructive"}>
              <span className={cn("size-1.5 rounded-full bg-current", connection.status === "connected" && "animate-pulse")} />
              {connectionLabel(connection.status)}
            </Badge>
            {canManage ? (
              <div className="flex items-center gap-2">
                <form action={verifyWhatsAppConnectionAction}>
                  <Button type="submit" variant="outline" size="sm"><RefreshCw aria-hidden /> Verificar</Button>
                </form>
                <Button asChild variant="outline" size="sm"><Link href="/configuracoes?aba=whatsapp">Configurar</Link></Button>
              </div>
            ) : null}
          </div>
          }
        />
      </div>

      {errorMessage ? (
        <div className="border-danger/30 bg-danger/10 text-danger mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm max-md:mx-4">
          <AlertCircle className="size-4" aria-hidden />{errorMessage}
        </div>
      ) : null}

      <WhatsAppMetricsPanel
        metrics={metrics}
        days={metricsDays}
        className="hidden lg:block"
        hrefForPeriod={Object.fromEntries(
          ([7, 30, 90] as const).map((period) => {
            const next = new URLSearchParams();
            next.set("periodo", String(period));
            if (selectedId) next.set("conversa", selectedId);
            if (filter !== "open") next.set("filtro", filter);
            if (search) next.set("busca", search);
            return [period, `/whatsapp?${next.toString()}`];
          }),
        ) as Record<7 | 30 | 90, string>}
      />

      <div className={cn(
        "border-border bg-surface grid min-h-96 min-w-0 max-w-full overflow-hidden rounded-2xl border shadow-sm lg:h-[calc(100dvh-20rem)] lg:min-h-125 lg:grid-cols-[19rem_minmax(0,1fr)_18rem]",
        selected
          ? "min-h-0 flex-1 max-lg:rounded-none max-lg:border-0 max-lg:shadow-none"
          : "h-[calc(100dvh-12rem)] max-md:h-auto max-md:min-h-0 max-md:flex-1 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:shadow-none",
      )}>
        <aside className={cn("border-border min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-r", selected ? "hidden lg:flex" : "flex")}>
          <div className="border-border min-w-0 max-w-full space-y-3 border-b p-3">
            <form className="relative min-w-0 max-w-full">
              <Search className="text-fg-subtle pointer-events-none absolute top-2 left-2.5 size-4" aria-hidden />
              <Input name="busca" defaultValue={search} placeholder="Buscar conversa" className="pl-8" />
              <input type="hidden" name="filtro" value={filter} />
            </form>
            <div className="flex max-w-full gap-1 overflow-x-auto pb-0.5 text-xs">
              {[["open", "Abertas"], ["unread", "Não lidas"], ["waiting_supplier", "Fornecedor"], ["waiting_buyer", "Comprador"], ["promotions", "Promoções"]].map(([value, label]) => (
                <Link key={value} href={`/whatsapp?filtro=${value}`} className={cn("rounded-full px-2.5 py-1 whitespace-nowrap", filter === value ? "bg-primary text-primary-fg" : "bg-surface-muted text-fg-muted hover:text-fg")}>{label}</Link>
              ))}
            </div>
            {canSend && contacts.length ? (
              <form action={startWhatsAppConversationAction} className="flex min-w-0 max-w-full gap-1.5">
                <SearchableSelect
                  id="whatsapp-start-contact"
                  name="contact_id"
                  required
                  className="min-w-0 flex-1"
                  options={contacts.map((contact) => ({
                    id: contact.id,
                    name: `${contact.suppliers?.name ?? "Fornecedor"} · ${contact.name}`,
                    description: contact.whatsapp ?? contact.phone ?? undefined,
                  }))}
                  placeholder="Digite fornecedor ou contato…"
                  emptyMessage="Nenhum contato encontrado."
                />
                <Button type="submit" size="icon" className="shrink-0" title="Iniciar conversa"><MessageCircle aria-hidden /></Button>
              </form>
            ) : null}
          </div>

          <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overscroll-contain">
            {conversations.length ? conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/whatsapp?conversa=${conversation.id}&filtro=${filter}${search ? `&busca=${encodeURIComponent(search)}` : ""}`}
                className={cn("border-border hover:bg-surface-muted flex w-full min-w-0 max-w-full gap-3 overflow-hidden border-b p-3 transition-colors", selected?.id === conversation.id && "bg-primary/8")}
              >
                <span className="bg-surface-muted text-fg-muted grid size-9 shrink-0 place-items-center rounded-full"><UserRound className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <strong className="text-fg min-w-0 flex-1 truncate text-sm font-medium">{conversation.suppliers?.name ?? conversation.display_name ?? conversation.normalized_phone ?? "Número desconhecido"}</strong>
                    {conversation.last_message_at ? <time className="text-fg-subtle shrink-0 text-[10px]">{dateFormatter.format(new Date(conversation.last_message_at))}</time> : null}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-start gap-2">
                    <span className="text-fg-muted line-clamp-2 min-w-0 flex-1 wrap-anywhere text-xs">{conversation.last_message_preview ?? "Conversa iniciada"}</span>
                    {conversation.unread_count ? <span className="bg-primary text-primary-fg grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] leading-5">{conversation.unread_count}</span> : null}
                  </span>
                  <span className="text-fg-subtle mt-1 block text-[10px]">{conversation.awaiting_side === "supplier" ? "Aguardando fornecedor" : conversation.awaiting_side === "buyer" ? "Aguardando comprador" : "Sem pendência"}</span>
                </span>
              </Link>
            )) : <p className="text-fg-muted p-6 text-center text-sm">Nenhuma conversa neste filtro.</p>}
          </div>
        </aside>

        <main className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden lg:flex")}>
          {selected ? (
            <>
              <header className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:gap-3 sm:px-4">
                <Button asChild variant="ghost" size="sm" className="lg:hidden"><Link href="/whatsapp">Voltar</Link></Button>
                <span className="min-w-0 flex-1">
                  <strong className="text-fg block truncate text-sm">{selected.suppliers?.name ?? selected.display_name ?? "Número desconhecido"}</strong>
                  <span className="text-fg-subtle block truncate text-xs">{selected.supplier_contacts?.name ?? selected.normalized_phone ?? selected.remote_jid}</span>
                </span>
                {nativeWhatsAppPhone ? (
                  <Button asChild variant="outline" size="sm" className="lg:hidden">
                    <a
                      href={`https://wa.me/${nativeWhatsAppPhone}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Abrir conversa no WhatsApp"
                    >
                      <MessageCircle aria-hidden />
                      <span className="hidden sm:inline">Abrir no WhatsApp</span>
                    </a>
                  </Button>
                ) : null}
                {selected.inbox_category === "promotion" ? <Badge variant="outline" className="hidden sm:inline-flex">Promoções</Badge> : null}
                {selected.unread_count ? <Badge variant="secondary">{selected.unread_count} não lidas</Badge> : null}
                {canSend ? (
                  <form action={setWhatsAppConversationCategoryAction}>
                    <input type="hidden" name="conversation_id" value={selected.id} />
                    <input type="hidden" name="category" value={selected.inbox_category === "promotion" ? "operational" : "promotion"} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      title={selected.inbox_category === "promotion" ? "Reativar conversa" : "Mover para promoções"}
                    >
                      {selected.inbox_category === "promotion" ? <BellRing aria-hidden /> : <BellOff aria-hidden />}
                      <span className="hidden sm:inline">{selected.inbox_category === "promotion" ? "Reativar" : "Promoções"}</span>
                    </Button>
                  </form>
                ) : null}
              </header>

              {selected.supplier_id || context.round || context.order ? (
                <nav
                  className="border-border bg-surface flex shrink-0 gap-2 overflow-x-auto border-b px-3 py-2 lg:hidden"
                  aria-label="Contexto da conversa"
                >
                  {selected.supplier_id ? (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/fornecedores/${selected.supplier_id}`}>Fornecedor</Link>
                    </Button>
                  ) : null}
                  {context.round ? (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/compras/${context.round.id}`}>Cotação</Link>
                    </Button>
                  ) : null}
                  {context.order ? (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/pedidos/${context.order.id}`}>Pedido</Link>
                    </Button>
                  ) : null}
                </nav>
              ) : null}

              <div className="wa-chat-bg min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
                <div className="mx-auto flex max-w-3xl flex-col gap-2">
                  {messages.length ? messages.map((message) => (
                    <article key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[86%] rounded-2xl px-3 py-2 text-sm shadow-xs sm:max-w-[72%]", message.direction === "outbound" ? "bg-primary/14 text-fg rounded-br-sm" : "bg-surface-elevated text-fg rounded-bl-sm")}>
                        {message.message_type !== "text" ? (
                          <div className="text-fg-muted mb-1 flex items-center gap-1.5 text-xs">
                            {message.message_type === "image" ? <ImageIcon className="size-3.5" /> : message.message_type === "audio" ? <Volume2 className="size-3.5" /> : <FileText className="size-3.5" />}
                            {message.media_file_name ?? messageTypeLabel(message.message_type)}
                          </div>
                        ) : null}
                        {message.message_type === "audio" && message.media_path ? (
                          <audio
                            controls
                            preload="none"
                            className="my-1 h-10 w-64 max-w-full"
                            src={`/api/whatsapp/media/${message.id}`}
                          >
                            Seu navegador não consegue reproduzir este áudio.
                          </audio>
                        ) : null}
                        {message.message_type === "image" && message.media_path ? (
                          <a
                            href={`/api/whatsapp/media/${message.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="my-1 block overflow-hidden rounded-lg"
                            title="Abrir imagem"
                          >
                            <Image
                              src={`/api/whatsapp/media/${message.id}`}
                              alt="Imagem recebida pelo WhatsApp"
                              width={720}
                              height={720}
                              sizes="(max-width: 640px) 80vw, 32rem"
                              unoptimized
                              className="max-h-96 h-auto w-auto max-w-full object-contain"
                            />
                          </a>
                        ) : null}
                        {message.body ? <p className="whitespace-pre-wrap wrap-break-word">{message.body}</p> : null}
                        <footer className="text-fg-subtle mt-1 flex items-center justify-end gap-1 text-[10px]">
                          <time>{timeFormatter.format(new Date(message.occurred_at))}</time>
                          {message.direction === "outbound" ? <StatusIcon status={message.status} /> : null}
                        </footer>
                        {message.error_message ? <p className="text-danger mt-1 text-[10px]">{message.error_message}</p> : null}
                      </div>
                    </article>
                  )) : <p className="text-fg-muted my-auto text-center text-sm">Envie a primeira mensagem para iniciar o atendimento.</p>}
                  <span data-whatsapp-messages-end />
                  <ScrollMessagesToBottom />
                </div>
              </div>

              <WhatsAppMessageComposer
                conversationId={selected.id}
                enabled={canSend && connection.status === "connected"}
              />
            </>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div><MessageCircle className="text-fg-subtle mx-auto size-9" /><h2 className="text-fg mt-3 font-medium">Selecione uma conversa</h2><p className="text-fg-muted mt-1 max-w-xs text-sm">O histórico e o contexto da compra aparecem juntos, sem misturar assuntos.</p></div>
            </div>
          )}
        </main>

        <aside className="border-border hidden min-h-0 overflow-y-auto border-l p-4 lg:block">
          {selected ? (
            <div className="space-y-5">
              <section><p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">Fornecedor</p><h3 className="text-fg mt-2 font-medium">{selected.suppliers?.name ?? "Não identificado"}</h3><p className="text-fg-muted mt-1 flex items-center gap-1.5 text-xs"><Phone className="size-3" />{selected.normalized_phone ?? selected.remote_jid}</p>{selected.supplier_id ? <Link href={`/fornecedores/${selected.supplier_id}`} className="text-primary mt-2 inline-block text-xs hover:underline">Abrir cadastro</Link> : <><p className="text-warning mt-2 text-xs">Vincule este número antes de usar dados recebidos na compra.</p>{canSend ? <form action={linkWhatsAppConversationAction} className="mt-3 grid gap-2"><input type="hidden" name="conversation_id" value={selected.id} /><SearchableSelect id="whatsapp-link-contact" name="contact_id" required options={contacts.map((contact) => ({ id: contact.id, name: `${contact.suppliers?.name ?? "Fornecedor"} · ${contact.name}`, description: contact.whatsapp ?? contact.phone ?? undefined }))} placeholder="Digite fornecedor ou contato…" emptyMessage="Nenhum contato encontrado." /><Button type="submit" size="sm" variant="outline">Vincular fornecedor</Button></form> : null}</>}</section>
              <section className="border-border border-t pt-4"><p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">Andamento</p><p className="text-fg-muted mt-2 text-xs">{selected.awaiting_side === "supplier" ? "Aguardando resposta do fornecedor" : selected.awaiting_side === "buyer" ? "Aguardando ação do comprador" : "Sem pendência definida"}</p>{canSend ? <div className="mt-3 grid gap-2"><form action={setWhatsAppConversationStateAction}><input type="hidden" name="conversation_id" value={selected.id} /><input type="hidden" name="awaiting_side" value="supplier" /><Button type="submit" variant="outline" size="sm" className="w-full">Aguardar fornecedor</Button></form><form action={setWhatsAppConversationStateAction}><input type="hidden" name="conversation_id" value={selected.id} /><input type="hidden" name="awaiting_side" value="buyer" /><Button type="submit" variant="outline" size="sm" className="w-full">Aguardar comprador</Button></form></div> : null}</section>
              <section className="border-border border-t pt-4"><p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">Organização da caixa</p><p className="text-fg-muted mt-2 text-xs">{selected.inbox_category === "promotion" ? "As mensagens continuam guardadas, mas não geram pendências na caixa principal." : "Se este contato envia ofertas frequentes, mova a conversa para Promoções pelo botão no cabeçalho."}</p></section>
              <section className="border-border border-t pt-4"><p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">Contexto da compra</p>{context.round ? <Link href={`/compras/${context.round.id}`} className="bg-surface-muted mt-2 block rounded-lg p-3 text-xs"><strong className="text-fg block">{context.round.title}</strong><span className="text-fg-muted">Cotação · {context.round.status}</span></Link> : <p className="text-fg-muted mt-2 text-xs">Nenhuma cotação vinculada.</p>}{context.order ? <Link href={`/pedidos/${context.order.id}`} className="bg-surface-muted mt-2 block rounded-lg p-3 text-xs"><strong className="text-fg block">Pedido</strong><span className="text-fg-muted">{context.order.status}</span></Link> : null}</section>
              <section className="border-border border-t pt-4"><p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">Atalhos produtivos</p><div className="text-fg-muted mt-2 space-y-2 text-xs"><p>Registrar observação, preço ou negociação a partir da mensagem entra na próxima evolução, depois de validar o recebimento real.</p></div></section>
            </div>
          ) : <p className="text-fg-muted text-sm">O contexto do fornecedor aparecerá aqui.</p>}
        </aside>
      </div>
      <WhatsAppLiveUpdates
        companyId={company.companyId}
        conversationId={selected?.id}
        canMarkRead={canSend}
      />
    </div>
  );
}
