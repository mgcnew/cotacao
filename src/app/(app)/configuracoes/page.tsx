import { Check, Minus } from "lucide-react";

import { DemandCalendarManager } from "@/components/demand-calendar/demand-calendar-manager";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeControls } from "@/components/theme-controls";
import { WhatsAppConnectionSettings } from "@/components/whatsapp/connection-settings";
import { WhatsAppTemplateSettings } from "@/components/whatsapp/template-settings";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCompany,
  listMembers,
  listPermissionCatalog,
  listRoles,
} from "@/features/company/queries";
import {
  listDemandCalendarEvents,
  listDemandCalendarOptions,
} from "@/features/demand-calendar/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { getWhatsAppConnection } from "@/features/whatsapp/queries";
import { isEvolutionProvisioningConfigured } from "@/lib/evolution/client";
import type { WhatsAppSetupState } from "@/features/whatsapp/connection-state";
import { getCompanyWhatsAppTemplates } from "@/features/whatsapp/templates";

function formatCnpj(value: string | null) {
  if (!value) return "—";
  const d = value.replace(/\D/g, "");
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const MODULE_LABEL: Record<string, string> = {
  analytics: "Análises",
  commercial_divergence: "Divergências comerciais",
  company_member: "Membros",
  negotiation: "Negociação",
  order: "Pedidos",
  permission_override: "Exceções de permissão",
  product: "Produtos",
  purchase_allocation: "Alocação",
  purchase_round: "Rodadas",
  quotation_response: "Respostas de cotação",
  receipt: "Recebimento",
  role: "Papéis",
  supplier: "Fornecedores",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const company = await requireActiveCompany();
  const [
    dados,
    roles,
    members,
    catalog,
    minhasPermissoes,
    whatsapp,
    templates,
    demandEvents,
    demandOptions,
    params,
  ] = await Promise.all([
    getCompany(company.companyId),
    listRoles(company.companyId),
    listMembers(company.companyId),
    listPermissionCatalog(),
    getPermissions(company.companyId),
    getWhatsAppConnection(company.companyId),
    getCompanyWhatsAppTemplates(company.companyId),
    listDemandCalendarEvents(company.companyId),
    listDemandCalendarOptions(company.companyId),
    searchParams,
  ]);
  const requestedTab = typeof params.aba === "string" ? params.aba : "";
  const activeTab = [
    "aparencia",
    "empresa",
    "demanda",
    "whatsapp",
    "papeis",
    "permissoes",
  ].includes(requestedTab)
    ? requestedTab
    : "aparencia";
  const evolutionConfigured = isEvolutionProvisioningConfigured();
  const whatsappState: WhatsAppSetupState = whatsapp
    ? {
        ok: whatsapp.status !== "error",
        configured: evolutionConfigured,
        status: evolutionConfigured
          ? (whatsapp.status as WhatsAppSetupState["status"])
          : "not_configured",
        phone: whatsapp.phone_number,
        qrCode: null,
        message: evolutionConfigured
          ? whatsapp.last_error
          : "A integração ainda não foi configurada no ambiente do servidor.",
        lastConnectedAt: whatsapp.last_connected_at,
        lastEventAt: whatsapp.last_event_at,
        lastSyncAt: whatsapp.last_sync_at,
      }
    : {
        ok: evolutionConfigured,
        configured: evolutionConfigured,
        status: evolutionConfigured ? "not_connected" : "not_configured",
        phone: null,
        qrCode: null,
        message: evolutionConfigured
          ? null
          : "A integração ainda não foi configurada no ambiente do servidor.",
        lastConnectedAt: null,
        lastEventAt: null,
        lastSyncAt: null,
      };

  return (
    <div className="w-full">
      <PageHeader
        title="Configurações"
        description="Aparência, demanda, integrações, dados da empresa e permissões."
      />

      <Tabs defaultValue={activeTab}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="demanda">Demanda</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="papeis">Papéis</TabsTrigger>
          <TabsTrigger value="permissoes">Minhas permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="aparencia" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tema</CardTitle>
              <CardDescription>
                Claro, escuro ou seguindo o sistema, e a cor de destaque da
                interface. A escolha fica salva neste navegador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeControls />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="empresa" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{dados.name}</CardTitle>
              <CardDescription>
                Alterar estes dados exige permissão administrativa e entra na
                fase de Configurações.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                ["Razão social", dados.legal_name ?? "—"],
                ["CNPJ", formatCnpj(dados.document_number)],
                ["Moeda", dados.currency_code],
                ["Fuso horário", dados.timezone],
                [
                  "Situação",
                  dados.status === "active" ? "Ativa" : dados.status,
                ],
                [
                  "Criada em",
                  new Date(dados.created_at).toLocaleDateString("pt-BR"),
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
                    {label}
                  </span>
                  <span className="text-fg-muted text-sm">{value}</span>
                </div>
              ))}

              <Separator className="sm:col-span-2" />

              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <span className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
                  Membros
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <span className="text-fg-muted">
                        {m.fullName ?? "(nome restrito)"}
                      </span>
                      <Badge variant="outline">{m.roleName}</Badge>
                      {m.status !== "active" ? (
                        <Badge variant="secondary">{m.status}</Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demanda" className="mt-4">
          <DemandCalendarManager
            events={demandEvents}
            categories={demandOptions.categories}
            products={demandOptions.products}
            canManage={
              minhasPermissoes.has("product.update") ||
              minhasPermissoes.has("purchase_round.create") ||
              minhasPermissoes.has("order.create")
            }
          />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppConnectionSettings
            initialState={whatsappState}
            canManage={minhasPermissoes.has("role.manage")}
          />
          <WhatsAppTemplateSettings
            templates={templates}
            canManage={minhasPermissoes.has("role.manage")}
          />
        </TabsContent>

        <TabsContent value="papeis" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Papéis da empresa</CardTitle>
              <CardDescription>
                Papéis são modelos. A regra efetiva de autorização é a permissão
                individual, que pode ser ajustada por exceções.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Papel</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Permissões</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        {role.name}
                        {role.isSystem ? (
                          <Badge variant="outline" className="ml-2">
                            sistema
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-fg-muted">
                        {role.description}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {role.permissionCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissoes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Suas permissões em {company.companyName}
              </CardTitle>
              <CardDescription>
                {minhasPermissoes.size} de{" "}
                {[...catalog.values()].reduce((acc, l) => acc + l.length, 0)}{" "}
                permissões, como {company.roleName}. Esta lista é informativa —
                quem autoriza de fato é o banco de dados.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {[...catalog.entries()].map(([module, perms]) => (
                <div key={module} className="flex flex-col gap-1.5">
                  <span className="text-fg text-sm font-medium">
                    {MODULE_LABEL[module] ?? module}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map((perm) => {
                      const tem = minhasPermissoes.has(perm.key);
                      return (
                        <span
                          key={perm.key}
                          title={perm.description ?? undefined}
                          className={
                            tem
                              ? "bg-success-soft text-success flex items-center gap-1 rounded-sm px-2 py-1 text-xs"
                              : "bg-surface-muted text-fg-subtle flex items-center gap-1 rounded-sm px-2 py-1 text-xs"
                          }
                        >
                          {tem ? (
                            <Check className="size-3" aria-hidden />
                          ) : (
                            <Minus className="size-3" aria-hidden />
                          )}
                          {perm.action}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
