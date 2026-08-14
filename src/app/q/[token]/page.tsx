import { Link2Off } from "lucide-react";

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
    <main className="bg-surface-sunken min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6">
          <p className="text-fg-subtle text-xs tracking-wider uppercase">
            Cotação de compra
          </p>
          <h1 className="text-fg mt-1 text-xl font-semibold tracking-tight">
            {quotation.purchase_round.title}
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            {quotation.company.name} está pedindo preços para{" "}
            {quotation.supplier.name}.
          </p>
          {respondidos > 0 ? (
            <p className="text-fg-subtle mt-2 text-sm">
              {respondidos} de {quotation.items.length}{" "}
              {quotation.items.length === 1 ? "item já respondido" : "itens já respondidos"}.
            </p>
          ) : null}
        </header>

        <QuotationResponseForm token={token} items={quotation.items} />

        <p className="text-fg-subtle mt-8 text-center text-xs">
          Este link é pessoal e identifica sua empresa. Não repasse.
        </p>
      </div>
    </main>
  );
}
