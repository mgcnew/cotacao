import { Clock3, Link2Off, ShieldCheck } from "lucide-react";

import { CompanyAvatar } from "@/components/company/company-avatar";
import { NegotiationReferenceResponseForm } from "@/components/quotations/negotiation-reference-response-form";
import { getPublicNegotiationReference } from "@/features/quotations/negotiation-reference";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function NegociacaoPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const negotiation = await getPublicNegotiationReference(token);

  if (!negotiation) {
    return (
      <main className="bg-surface-sunken flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="border-border bg-surface flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <div className="bg-surface-muted text-fg-subtle grid size-10 place-items-center rounded-lg">
            <Link2Off className="size-5" aria-hidden />
          </div>
          <p className="text-fg font-medium">Link inválido ou expirado</p>
          <p className="text-fg-muted text-sm">
            Peça um novo link de negociação ao comprador.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-surface-sunken min-h-dvh px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="border-border bg-surface mb-4 overflow-hidden rounded-2xl border shadow-xs sm:mb-6">
          <div className="border-border border-b p-4 sm:p-5">
            <p className="text-primary text-[11px] font-semibold tracking-[0.14em] uppercase">
              Referência para negociação
            </p>
            <h1 className="text-fg mt-1 text-2xl font-semibold tracking-tight">
              {negotiation.purchase_round.title}
            </h1>
            <p className="text-fg-muted mt-1 max-w-2xl text-sm">
              O comprador compartilhou referências anonimizadas para estes
              produtos. Se puder melhorar sua condição, informe uma nova oferta.
            </p>
          </div>
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-3 sm:p-5">
            <div className="flex items-start gap-2.5">
              <CompanyAvatar
                name={negotiation.company.name}
                logoPath={negotiation.company.logo_path}
                className="size-8 rounded-lg"
              />
              <div>
                <p className="text-fg-subtle text-xs">Comprador</p>
                <p className="text-fg font-medium">
                  {negotiation.company.name}
                </p>
              </div>
            </div>
            <div>
              <p className="text-fg-subtle text-xs">Fornecedor convidado</p>
              <p className="text-fg font-medium">{negotiation.supplier.name}</p>
            </div>
            <div className="flex items-start gap-2">
              <Clock3 className="text-fg-subtle mt-0.5 size-4" aria-hidden />
              <div>
                <p className="text-fg-subtle text-xs">Link válido até</p>
                <p className="text-fg font-medium">
                  {DATE_TIME.format(new Date(negotiation.expires_at))}
                </p>
              </div>
            </div>
          </div>
        </header>

        <NegotiationReferenceResponseForm
          token={token}
          negotiation={negotiation}
        />

        <p className="text-fg-subtle mt-6 flex items-center justify-center gap-1.5 text-center text-xs print:hidden sm:mt-8">
          <ShieldCheck className="size-3.5" aria-hidden /> Os demais fornecedores
          não são identificados neste documento.
        </p>
      </div>
    </main>
  );
}
