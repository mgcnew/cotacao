import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { descreverRodada } from "@/components/rounds/round-central";
import { RoundModalNav } from "@/components/rounds/round-modal-nav";
import { carregarRodada, carregarRodadaBasica } from "@/features/rounds/central";

/**
 * A casca da rodada em página: cabeçalho e abas que ficam, miolo que troca.
 *
 * É a mesma ideia do `layout.tsx` do modal, no mesmo lugar do raciocínio: o
 * cabeçalho fala da RODADA, não da aba, e por isso mora num layout. Trocar de
 * aba troca só o `children` — o título não pisca, a faixa de abas não remonta e
 * cada aba tem a sua própria fronteira de espera (`loading.tsx` / `<Suspense>`).
 * A rodada é lida uma vez: as abas dividem o `cache()` de `carregarRodada`.
 *
 * Fica num grupo `(rodada)` para o relatório, que tem cabeçalho próprio e
 * precisa imprimir limpo, ficar de fora desta casca.
 */
export default async function LayoutDaRodada({
  params,
  children,
}: LayoutProps<"/compras/[id]">) {
  const { id } = await params;

  return (
    <div className="w-full">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-fg text-xl font-semibold tracking-tight">
            <Suspense
              fallback={
                <span className="bg-surface-muted block h-6 w-48 animate-pulse rounded" />
              }
            >
              <Titulo id={id} />
            </Suspense>
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            <Suspense
              fallback={
                <span className="bg-surface-muted block h-4 w-72 animate-pulse rounded" />
              }
            >
              <Descricao id={id} />
            </Suspense>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button asChild size="sm" variant="ghost">
            <Link href="/compras">Voltar</Link>
          </Button>
          <Suspense fallback={null}>
            <AcaoRelatorio id={id} />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<div className="border-border mb-5 h-11 border-b" />}>
        <Abas id={id} />
      </Suspense>

      {children}
    </div>
  );
}

async function Titulo({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  return <>{round?.title ?? "Rodada"}</>;
}

async function Descricao({ id }: { id: string }) {
  const dados = await carregarRodada(id);
  return <>{dados ? descreverRodada(dados) : "Esta rodada não existe mais."}</>;
}

async function AcaoRelatorio({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  if (!round || round.status !== "completed") return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/compras/${id}/relatorio`}>Relatório</Link>
    </Button>
  );
}

/** Antes de iniciar não há o que comparar nem decidir: sem abas, só a montagem. */
async function Abas({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  if (!round || round.status === "draft") return null;
  return (
    <div className="mb-5">
      <RoundModalNav roundId={id} substituir={false} />
    </div>
  );
}
