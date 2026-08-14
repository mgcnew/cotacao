import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPermissions, requireActiveCompany, requireUser } from "@/lib/auth/dal";

export default async function DashboardPage() {
  const user = await requireUser();
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6">
        <h1 className="text-fg text-xl font-semibold tracking-tight">
          Central operacional
        </h1>
        <p className="text-fg-muted mt-1 text-sm">
          Sessão ativa em {company.companyName} como {company.roleName}.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fase 2 concluída</CardTitle>
          <CardDescription>
            Autenticação, multiempresa e permissões estão ligados ao banco real.
            Os indicadores e a Central de Atenção entram na fase do Dashboard,
            depois que existirem rodadas e pedidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
              Usuário
            </span>
            <span className="text-fg-muted">{user.email}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
              Papel e permissões efetivas
            </span>
            <span className="text-fg-muted">
              {company.roleName} · {permissions.size} permissões
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
              Módulos liberados
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[...permissions]
                .map((key) => key.split(".")[0])
                .filter((value, index, all) => all.indexOf(value) === index)
                .sort()
                .map((module) => (
                  <span
                    key={module}
                    className="bg-surface-muted text-fg-muted rounded-sm px-2 py-1 font-mono text-xs"
                  >
                    {module}
                  </span>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
