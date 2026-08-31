import { ArrowLeft, Check, FileCheck2, Scale, Send } from "lucide-react";
import Link from "next/link";

import { CotaProLogo } from "@/components/brand/cotapro-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const STEPS = [
  { label: "Cotação enviada", detail: "5 fornecedores", icon: Send },
  {
    label: "Melhor proposta definida",
    detail: "economia registrada",
    icon: Scale,
  },
  { label: "NF-e conferida", detail: "pedido conciliado", icon: FileCheck2 },
] as const;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-background flex min-h-dvh">
      <aside className="border-border bg-surface-sunken relative hidden w-[46%] flex-col justify-between overflow-hidden border-r p-10 lg:flex xl:p-14">
        <CotaProLogo />

        <div className="relative z-10 max-w-lg py-12">
          <p className="text-primary text-xs font-semibold tracking-[0.16em] uppercase">
            Operação conectada
          </p>
          <h1 className="text-fg mt-4 text-4xl leading-tight font-semibold tracking-[-0.035em] xl:text-5xl">
            Cada decisão de compra com contexto do início ao fim.
          </h1>
          <p className="text-fg-muted mt-5 max-w-md leading-relaxed">
            Planeje a demanda, compare propostas, acompanhe pedidos e transforme
            cada recebimento em aprendizado para a próxima negociação.
          </p>

          <div className="border-border bg-surface mt-10 max-w-md rounded-2xl border p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-fg text-sm font-semibold">Compra #1048</p>
                <p className="text-fg-subtle mt-0.5 text-xs">
                  Jornada concluída
                </p>
              </div>
              <span className="bg-success-soft text-success inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium">
                <Check className="size-3" aria-hidden /> Conferida
              </span>
            </div>

            <div className="border-border relative border-l pl-6">
              {STEPS.map(({ label, detail, icon: Icon }, index) => (
                <div
                  key={label}
                  className={`relative flex items-center gap-3 py-3 ${index > 0 ? "border-border border-t" : ""}`}
                >
                  <span className="border-surface bg-primary absolute -left-[30px] grid size-3 rounded-full border-2" />
                  <span className="bg-primary-soft text-primary grid size-8 place-items-center rounded-lg">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-fg text-xs font-medium">{label}</p>
                    <p className="text-fg-subtle mt-0.5 text-[10px]">
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-fg-subtle text-xs">
          CotaPro · gestão do pedido ao recebimento
        </p>

        <div
          className="bg-primary-soft absolute -right-28 -bottom-28 size-80 rounded-full opacity-65"
          aria-hidden
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
          <CotaProLogo compact className="lg:hidden" />
          <Link
            href="/"
            className="text-fg-muted hover:text-fg hidden items-center gap-1.5 text-sm transition-colors lg:flex"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Voltar para o início
          </Link>
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <div className="text-fg-subtle px-5 pb-6 text-center text-[11px] sm:px-8">
          Acesso protegido e dados separados por empresa.
        </div>
      </section>
    </div>
  );
}
