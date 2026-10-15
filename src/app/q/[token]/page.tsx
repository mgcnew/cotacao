import { Link2Off, ShieldCheck } from "lucide-react";

import { CompanyAvatar } from "@/components/company/company-avatar";
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
  const total = quotation.items.length;

  return (
    <main className="bg-surface-sunken min-h-dvh px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        {/*
          Cabeçalho curto de propósito: no celular, tudo o que vem antes do
          primeiro produto empurra as três respostas para fora da tela. Quem
          pede, o que fazer e quanto falta cabem aqui em três linhas; o
          restante (convite pessoal) desce para o rodapé.
        */}
        <header className="border-border bg-surface mb-4 rounded-2xl border p-4 shadow-xs sm:mb-6 sm:p-5">
          <div className="flex items-start gap-3">
            <CompanyAvatar
              name={quotation.company.name}
              logoPath={quotation.company.logo_path}
              className="size-10 shrink-0 rounded-lg"
            />
            <div className="min-w-0">
              <h1 className="text-fg text-xl leading-tight font-semibold tracking-tight text-balance sm:text-2xl">
                {quotation.company.name} pede preço de {total}{" "}
                {total === 1 ? "item" : "itens"}
              </h1>
              <p className="text-fg-muted mt-0.5 text-sm">
                {quotation.purchase_round.title}
                {respondidos > 0
                  ? ` · ${respondidos} de ${total} já respondidos`
                  : ""}
              </p>
            </div>
          </div>
          <p className="text-fg mt-3 text-sm leading-relaxed">
            Em cada produto toque em uma opção:{" "}
            <strong>Tenho</strong> (e informe o preço),{" "}
            <strong>Sem estoque agora</strong> (trabalha com o produto, mas não
            consegue desta vez) ou <strong>Não trabalho</strong> com ele.
          </p>
        </header>

        <QuotationResponseForm token={token} items={quotation.items} />

        <p className="text-fg-muted mt-6 flex items-start justify-center gap-1.5 text-center text-[13px] sm:mt-8">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Link pessoal de {quotation.supplier.name}. Não repasse.
          </span>
        </p>
      </div>
    </main>
  );
}
