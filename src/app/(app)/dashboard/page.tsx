import { PageHeader } from "@/components/layout/page-header";
import { AttentionList } from "@/components/dashboard/attention-list";
import { getAttentionItems } from "@/features/dashboard/attention";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * Central Operacional — documento mestre, seção 13.
 *
 * A ordem da página é a ordem das perguntas que ela responde: primeiro o que
 * precisa de atenção agora, depois como estão as compras, depois o dinheiro.
 * Pendência acionável vem antes de qualquer número — o documento é explícito
 * que atividade recente tem prioridade inferior.
 */
export default async function DashboardPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  const atencao = await getAttentionItems(company.companyId, permissions);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Central operacional"
        description={`${company.companyName} · ${company.roleName}`}
      />

      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Precisa da sua atenção
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Condições que continuam valendo até alguém resolver — diferente do
          sino, que avisa o que acabou de acontecer.
        </p>
        <AttentionList items={atencao} />
      </section>
    </div>
  );
}
