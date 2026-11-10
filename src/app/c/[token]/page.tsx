import { Link2Off } from "lucide-react";
import type { Metadata } from "next";

import { PublicCount } from "@/components/stock-counts/public-count";
import { getPublicStockCount } from "@/features/stock-counts/public";

export const metadata: Metadata = {
  title: "Contagem de estoque | CotaPro",
  description: "Contagem de estoque para conferência.",
  robots: { index: false, follow: false },
  // O token está no caminho: não vaza para outros sites pelo Referer.
  referrer: "no-referrer",
};

/** A contagem aberta pelo link da mensagem do WhatsApp — pública, sem login. */
export default async function ContagemPublicaPage({
  params,
}: PageProps<"/c/[token]">) {
  const { token } = await params;
  const data = await getPublicStockCount(token);

  if (!data) {
    return (
      <main className="bg-surface-sunken flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="border-border bg-surface flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center shadow-xs">
          <div className="bg-surface-muted text-fg-subtle grid size-10 place-items-center rounded-lg">
            <Link2Off className="size-5" aria-hidden />
          </div>
          <p className="text-fg font-medium">Link inválido ou trocado</p>
          <p className="text-fg-muted text-sm">
            Peça a quem fez a contagem para compartilhar de novo.
          </p>
        </div>
      </main>
    );
  }

  return <PublicCount data={data} />;
}
