import { ChevronRight, ClipboardCheck, Lock } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { NewCountDialog } from "@/components/stock-counts/new-count-dialog";
import { listStockCounts } from "@/features/stock-counts/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * As contagens de estoque, da mais nova para a mais antiga.
 *
 * Feita para o celular: cada contagem é uma linha inteira tocável, e o botão
 * de começar ocupa a largura da tela, onde o polegar alcança.
 */
export default async function ContagensPage() {
  const company = await requireActiveCompany();
  const [counts, permissions] = await Promise.all([
    listStockCounts(company.companyId),
    getPermissions(company.companyId),
  ]);
  const canManage =
    permissions.has("product.update") ||
    permissions.has("purchase_round.create") ||
    permissions.has("order.create");
  const dia = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: company.companyTimezone,
  });
  const quando = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: company.companyTimezone,
  });

  return (
    <div className="w-full">
      <PageHeader
        title="Contagem de estoque"
        info="Conte os produtos da loja por local e mande o resultado pelo WhatsApp para bater com o estoque do sistema."
        action={canManage ? <NewCountDialog /> : null}
      />

      {counts.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma contagem ainda"
          description="Comece uma contagem e vá lançando o que encontra em cada canto: geladeira, estoque, gôndola."
        />
      ) : (
        <ul
          aria-label="Contagens"
          className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs"
        >
          {counts.map((count) => (
            <li key={count.id} className="border-border border-b last:border-b-0">
              <Link
                href={`/contagens/${count.id}`}
                className="active:bg-surface-muted hover:bg-surface-muted flex min-h-16 items-center gap-3 px-4 py-3 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-fg line-clamp-2 text-sm leading-snug font-semibold">
                    {count.name ??
                      `Contagem de ${dia.format(new Date(count.createdAt))}`}
                  </span>
                  <span className="text-fg-subtle mt-0.5 flex items-center gap-1.5 text-xs">
                    {count.status === "closed" ? (
                      <>
                        <Lock className="size-3 shrink-0" aria-hidden />
                        <span>Finalizada</span>
                      </>
                    ) : (
                      <span className="text-primary font-medium">
                        Em andamento
                      </span>
                    )}
                    <span aria-hidden>·</span>
                    <span className="truncate">
                      {count.products === 1
                        ? "1 produto"
                        : `${count.products} produtos`}{" "}
                      · {quando.format(new Date(count.createdAt))}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="text-fg-subtle size-4 shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
