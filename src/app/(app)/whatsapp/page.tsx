import { AlertCircle, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppInbox } from "@/components/whatsapp/inbox";
import { WhatsAppMetricsStrip } from "@/components/whatsapp/metrics";
import { MetricsPeriod } from "@/components/whatsapp/metrics-period";
import { verifyWhatsAppConnectionAction } from "@/features/whatsapp/actions";
import { parseFilter } from "@/features/whatsapp/inbox-logic";
import {
  getInboxConversation,
  getWhatsAppConnection,
  getWhatsAppContext,
  getWhatsAppMetrics,
  listInboxConversations,
  listInboxMessages,
  listWhatsAppContacts,
} from "@/features/whatsapp/queries";
import type { ConversationSnapshot } from "@/features/whatsapp/types";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

async function MetricsBar({
  companyId,
  days,
}: {
  companyId: string;
  days: number;
}) {
  const metrics = await getWhatsAppMetrics(companyId, days);
  return <WhatsAppMetricsStrip metrics={metrics} />;
}

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("purchase_round.view")) redirect("/dashboard");

  const params = await searchParams;
  const requestedId = param(params.conversa);
  const requestedPeriod = Number(param(params.periodo));
  const metricsDays =
    requestedPeriod === 7 || requestedPeriod === 90 ? requestedPeriod : 30;
  const errorMessage = param(params.erro);
  const canSend = permissions.has("purchase_round.send");
  const canManage = permissions.has("role.manage");

  const connection = await getWhatsAppConnection(company.companyId);

  if (!connection) {
    return (
      <div className="w-full">
        <PageHeader
          title="WhatsApp Compras"
          description="Conversas operacionais com fornecedores, ligadas às suas compras."
        />
        <div className="border-border bg-surface mx-auto mt-12 max-w-xl rounded-2xl border p-8 text-center shadow-sm">
          <span className="bg-primary/10 text-primary mx-auto mb-4 grid size-12 place-items-center rounded-2xl">
            <MessageCircle className="size-6" aria-hidden />
          </span>
          <h2 className="text-fg text-lg font-semibold">
            Ativar a caixa de compras
          </h2>
          <p className="text-fg-muted mx-auto mt-2 max-w-md text-sm">
            Conecte o número da empresa por QR Code nas Configurações. Nenhuma
            chave da Evolution será enviada ao navegador.
          </p>
          {errorMessage ? (
            <p className="text-destructive mt-4 text-sm">{errorMessage}</p>
          ) : null}
          {canManage ? (
            <Button asChild className="mt-6">
              <Link href="/configuracoes?aba=whatsapp">
                Configurar WhatsApp
              </Link>
            </Button>
          ) : (
            <p className="text-fg-subtle mt-5 text-xs">
              Um administrador precisa realizar a ativação inicial.
            </p>
          )}
        </div>
      </div>
    );
  }

  const [listed, contacts] = await Promise.all([
    listInboxConversations(company.companyId),
    canSend ? listWhatsAppContacts(company.companyId) : Promise.resolve([]),
  ]);

  // Link direto para uma conversa: ela já chega com o histórico, e, se ficou
  // fora das mais recentes, entra na lista só para poder ser aberta.
  const selectedId = UUID.test(requestedId) ? requestedId : null;
  let conversations = listed;
  let snapshot: ConversationSnapshot | null = null;
  let initialSelectedId: string | null = null;
  if (selectedId) {
    const found =
      listed.find((item) => item.id === selectedId) ??
      (await getInboxConversation(company.companyId, selectedId));
    if (found) {
      if (!listed.some((item) => item.id === found.id)) {
        conversations = [found, ...listed];
      }
      const [page, context] = await Promise.all([
        listInboxMessages(company.companyId, found.id),
        getWhatsAppContext(company.companyId, found.roundId, found.orderId),
      ]);
      snapshot = { messages: page.messages, hasMore: page.hasMore, context };
      initialSelectedId = found.id;
    }
  }

  return (
    <div
      data-mobile-scroll="contained"
      className="flex min-h-0 w-full flex-1 flex-col"
    >
      <div className="mb-3 hidden shrink-0 items-center justify-between gap-4 lg:flex">
        <div className="flex min-w-0 items-center gap-4">
          <Suspense
            key={metricsDays}
            fallback={<Skeleton className="h-5 w-96 max-w-full" />}
          >
            <MetricsBar companyId={company.companyId} days={metricsDays} />
          </Suspense>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Suspense fallback={null}>
            <MetricsPeriod days={metricsDays} />
          </Suspense>
          {canManage ? (
            <>
              <form action={verifyWhatsAppConnectionAction}>
                <Button type="submit" variant="outline" size="sm">
                  <RefreshCw aria-hidden /> Verificar
                </Button>
              </form>
              <Button asChild variant="outline" size="sm">
                <Link href="/configuracoes?aba=whatsapp">Configurar</Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="bg-destructive-soft text-destructive mb-3 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm max-md:mx-4 max-md:mt-3"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {errorMessage}
        </div>
      ) : null}

      <Suspense fallback={null}>
        <WhatsAppInbox
          companyId={company.companyId}
          initialFilter={parseFilter(param(params.filtro))}
          timeZone={company.companyTimezone}
          initialConversations={conversations}
          initialSelectedId={initialSelectedId}
          initialSnapshot={snapshot}
          contacts={contacts.map((contact) => ({
            id: contact.id,
            label: `${contact.suppliers?.name ?? "Fornecedor"} · ${contact.name}`,
            detail: contact.whatsapp ?? contact.phone ?? null,
          }))}
          connectionStatus={connection.status}
          canSend={canSend}
          canManage={canManage}
        />
      </Suspense>
    </div>
  );
}
