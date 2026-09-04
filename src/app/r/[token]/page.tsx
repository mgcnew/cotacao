import { Link2Off } from "lucide-react";
import type { Metadata } from "next";

import { PublicReceivingDisplay } from "@/components/receipts/public-receiving-display";
import { getPublicReceivingDisplay } from "@/features/receipts/public-display";

export const metadata: Metadata = {
  title: "Próximas entregas | CotaPro",
  description: "Painel de consulta das próximas entregas.",
  robots: { index: false, follow: false },
};

export default async function ReceivingDisplayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPublicReceivingDisplay(token);

  if (!data) {
    return (
      <main className="bg-surface-sunken flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="border-border bg-surface flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center shadow-xs">
          <div className="bg-surface-muted text-fg-subtle grid size-10 place-items-center rounded-lg">
            <Link2Off className="size-5" aria-hidden />
          </div>
          <p className="text-fg font-medium">Link inválido ou revogado</p>
          <p className="text-fg-muted text-sm">
            Solicite ao administrador um novo link para o painel de
            recebimento.
          </p>
        </div>
      </main>
    );
  }

  return <PublicReceivingDisplay data={data} />;
}
