import Link from "next/link";

import { CotaProLogo } from "@/components/brand/cotapro-logo";
import { buttonVariants } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="bg-background grid min-h-dvh place-items-center p-6">
      <section className="border-border bg-surface w-full max-w-md rounded-xl border p-6 text-center shadow-sm">
        <CotaProLogo compact className="mx-auto" />
        <h1 className="text-fg mt-6 text-xl font-semibold">Sem conexão</h1>
        <p className="text-fg-muted mt-2 text-sm leading-6">
          Seus dados operacionais não são armazenados offline. Reconecte o
          aparelho para acessar informações atualizadas com segurança.
        </p>
        <Link href="/dashboard" className={buttonVariants({ className: "mt-6" })}>
          Tentar novamente
        </Link>
      </section>
    </main>
  );
}
