import { Building2, Link2Off, PackageSearch, ShieldCheck } from "lucide-react";

import { QuotationResponseForm } from "@/components/quotations/quotation-response-form";
import { getPublicQuotation } from "@/features/quotations/public";

/**
 * Cotação do fornecedor — página pública, sem login.
 *
 * O token vem na URL e só o hash dele existe no banco. Nada aqui usa a sessão
 * do comprador: o `proxy.ts` já trata `/q/` como rota pública.
 */
export default async function CotacaoPublicaPage({
  params,
}: PageProps<"/q/[token]">) {
  const { token } = await params;
  const quotation = await getPublicQuotation(token);

  if (!quotation) {
    return (
      <main className="bg-surface-sunken flex min-h-screen items-center justify-center px-6 py-12">
        <div className="border-border bg-surface flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <div className="bg-surface-muted text-fg-subtle grid size-10 place-items-center rounded-lg">
            <Link2Off className="size-5" aria-hidden />
          </div>
          <p className="text-fg font-medium">Link inválido ou expirado</p>
          <p className="text-fg-muted text-sm">
            Peça um novo link ao comprador que enviou esta cotação.
          </p>
        </div>
      </main>
    );
  }

  const respondidos = quotation.items.filter((i) => i.already_answered).length;

  return (
    <main className="bg-surface-sunken min-h-dvh px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="border-border bg-surface mb-4 overflow-hidden rounded-2xl border shadow-xs sm:mb-6">
          <div className="border-border border-b p-4 sm:p-5">
            <p className="text-primary text-[11px] font-semibold tracking-[0.14em] uppercase">
              Solicitação de cotação
            </p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-fg text-2xl font-semibold tracking-tight">
                  {quotation.purchase_round.title}
                </h1>
                <p className="text-fg-muted mt-1 max-w-xl text-sm">
                  Informe um preço ou a disponibilidade de cada produto. Você
                  poderá revisar tudo antes de enviar.
                </p>
              </div>
              <span className="bg-primary-soft text-primary rounded-full px-3 py-1 text-xs font-medium">
                {quotation.items.length}{" "}
                {quotation.items.length === 1 ? "item" : "itens"}
              </span>
            </div>
          </div>
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
            <div className="flex items-start gap-2.5">
              <Building2
                className="text-fg-subtle mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <div>
                <p className="text-fg-subtle text-xs">Comprador</p>
                <p className="text-fg font-medium">{quotation.company.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <PackageSearch
                className="text-fg-subtle mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <div>
                <p className="text-fg-subtle text-xs">Fornecedor convidado</p>
                <p className="text-fg font-medium">{quotation.supplier.name}</p>
                {respondidos > 0 ? (
                  <p className="text-fg-muted text-xs">
                    {respondidos} de {quotation.items.length} já respondidos
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <QuotationResponseForm token={token} items={quotation.items} />

        <p className="text-fg-subtle mt-6 flex items-center justify-center gap-1.5 text-center text-xs sm:mt-8">
          <ShieldCheck className="size-3.5" aria-hidden /> Este link é pessoal e
          identifica sua empresa. Não repasse.
        </p>
      </div>
    </main>
  );
}
