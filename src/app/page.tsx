import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BadgeDollarSign,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  History,
  ListChecks,
  MessageCircle,
  PackageCheck,
  Scale,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";

import { CotaProLogo, CotaProMark } from "@/components/brand/cotapro-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "CotaPro — operação inteligente do pedido ao recebimento",
  description:
    "Centralize demandas, cotações, negociações, pedidos, recebimentos por NF-e e análises em uma única operação de compras.",
};

const FLOW = [
  {
    number: "01",
    title: "Planeje",
    description: "Agenda recorrente e lista de compras organizam a demanda.",
    icon: CalendarDays,
  },
  {
    number: "02",
    title: "Cote",
    description: "Fornecedores respondem por link, sem precisar de cadastro.",
    icon: Send,
  },
  {
    number: "03",
    title: "Decida",
    description: "Compare propostas e negocie com contexto de preço.",
    icon: Scale,
  },
  {
    number: "04",
    title: "Acompanhe",
    description: "Pedidos, confirmações e conversas ficam no mesmo fluxo.",
    icon: Truck,
  },
  {
    number: "05",
    title: "Confira",
    description: "A NF-e fecha o ciclo e alimenta o histórico real.",
    icon: PackageCheck,
  },
] as const;

const FEATURES = [
  {
    icon: ListChecks,
    title: "Demanda organizada",
    description:
      "Lista de compras, agenda por fornecedor e múltiplos dias na semana para transformar rotina em planejamento.",
  },
  {
    icon: Users,
    title: "Fornecedor participa sem atrito",
    description:
      "Links claros para cotação e confirmação, com disponibilidade, justificativas e orientação item a item.",
  },
  {
    icon: BadgeDollarSign,
    title: "Comparação que leva à decisão",
    description:
      "Propostas lado a lado, melhor alocação, negociação e registro do que foi realmente acordado.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp conectado à compra",
    description:
      "Envios, retornos e conversas operacionais permanecem próximos da rodada e do fornecedor certo.",
  },
  {
    icon: FileCheck2,
    title: "Conferência inteligente por NF-e",
    description:
      "Associe nomenclaturas, converta unidades, entenda impostos e reutilize o aprendizado nas próximas notas.",
  },
  {
    icon: BarChart3,
    title: "Gestão com explicação",
    description:
      "Indicadores mostram o resultado e permitem percorrer a jornada que formou cada valor.",
  },
] as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-primary mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
      {children}
    </p>
  );
}

function DashboardPreview() {
  const metrics = [
    {
      label: "Cotações em andamento",
      value: "4",
      note: "2 aguardam resposta",
      tone: "primary",
      icon: ShoppingCart,
    },
    {
      label: "Economia negociada",
      value: "R$ 842,30",
      note: "+6,4% no período",
      tone: "success",
      icon: BadgeDollarSign,
    },
    {
      label: "Recebimentos hoje",
      value: "7",
      note: "5 já conferidos",
      tone: "info",
      icon: PackageCheck,
    },
  ] as const;

  return (
    <div className="border-border bg-surface overflow-hidden rounded-2xl border shadow-md">
      <div className="border-border flex h-12 items-center gap-2 border-b px-4">
        <CotaProMark className="size-6" />
        <span className="text-fg text-xs font-semibold">
          Central operacional
        </span>
        <div className="flex-1" />
        <span className="bg-surface-muted text-fg-subtle grid size-7 place-items-center rounded-md">
          <Search className="size-3.5" aria-hidden />
        </span>
        <span className="bg-primary-soft text-primary grid size-7 place-items-center rounded-md text-[10px] font-semibold">
          MC
        </span>
      </div>

      <div className="grid min-h-[385px] grid-cols-[52px_1fr] sm:grid-cols-[150px_1fr]">
        <div className="border-border bg-surface-sunken border-r p-2.5 sm:p-3">
          <div className="space-y-1">
            {[
              { icon: BarChart3, label: "Central" },
              { icon: ListChecks, label: "Lista" },
              { icon: ShoppingCart, label: "Compras" },
              { icon: ClipboardCheck, label: "Pedidos" },
              { icon: Truck, label: "Fornecedores" },
            ].map(({ icon: Icon, label }, index) => (
              <div
                key={label}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2",
                  index === 0
                    ? "bg-primary-soft text-primary"
                    : "text-fg-subtle",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="hidden text-[10px] sm:block">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 p-3 sm:p-5">
          <div className="mb-4">
            <p className="text-fg text-sm font-semibold">Visão de hoje</p>
            <p className="text-fg-subtle text-[10px]">
              O que precisa da sua atenção agora
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {metrics.map(({ label, value, note, tone, icon: Icon }) => {
              const classes = {
                primary: "bg-primary-soft text-primary",
                success: "bg-success-soft text-success",
                info: "bg-info-soft text-info",
              }[tone];
              return (
                <div
                  key={label}
                  className="border-border bg-surface rounded-xl border p-3 shadow-xs"
                >
                  <span
                    className={cn(
                      "mb-3 grid size-7 place-items-center rounded-lg",
                      classes,
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <p className="text-fg text-base font-semibold tabular-nums">
                    {value}
                  </p>
                  <p className="text-fg mt-0.5 text-[9px] font-medium">
                    {label}
                  </p>
                  <p className="text-fg-subtle mt-1 text-[9px]">{note}</p>
                </div>
              );
            })}
          </div>

          <div className="border-border mt-3 overflow-hidden rounded-xl border">
            <div className="bg-surface-muted text-fg-muted grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-[9px] font-medium">
              <span>Próximas ações</span>
              <span>Fornecedor</span>
              <span>Status</span>
            </div>
            {[
              ["Revisar cotação #1048", "Alimentos Sul", "Decidir"],
              ["Conferir pedido #382", "Casa do Frio", "Receber"],
              ["Responder divergência", "Mercantil SP", "Analisar"],
            ].map(([action, supplier, status], index) => (
              <div
                key={action}
                className={cn(
                  "text-fg grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 text-[9px]",
                  index > 0 && "border-border border-t",
                )}
              >
                <span className="truncate font-medium">{action}</span>
                <span className="text-fg-subtle hidden sm:block">
                  {supplier}
                </span>
                <span className="bg-primary-soft text-primary rounded-full px-2 py-1 font-medium">
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NfePreview() {
  return (
    <div className="border-border bg-surface rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-fg text-sm font-semibold">Conferência da NF-e</p>
          <p className="text-fg-subtle mt-0.5 text-xs">
            Nota 000.148 · 3 itens
          </p>
        </div>
        <span className="bg-success-soft text-success inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium">
          <CheckCircle2 className="size-3" aria-hidden /> XML validado
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {[
          ["TRIDENT HORT 21UN", "Trident Hortelã", "21 un. × R$ 1,76"],
          ["MEIA CARC SUINA", "Metade suína", "42,8 kg × R$ 12,90"],
          ["OLEO SOJA CX 20", "Óleo de soja 900ml", "20 un. × R$ 6,18"],
        ].map(([fiscal, product, conversion]) => (
          <div
            key={fiscal}
            className="border-border bg-surface-sunken rounded-xl border p-3"
          >
            <div className="flex items-center gap-2">
              <Check className="text-success size-3.5 shrink-0" aria-hidden />
              <p className="text-fg min-w-0 flex-1 truncate text-xs font-medium">
                {product}
              </p>
              <span className="text-fg-subtle text-[10px] tabular-nums">
                {conversion}
              </span>
            </div>
            <p className="text-fg-subtle mt-1 pl-5.5 text-[10px]">
              Na nota: {fiscal}
            </p>
          </div>
        ))}
      </div>

      <div className="border-border mt-4 flex items-center justify-between border-t pt-4 text-xs">
        <span className="text-fg-muted">Diferença comercial</span>
        <strong className="text-success tabular-nums">− R$ 10,50</strong>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main
      data-slot="landing-page"
      className="bg-background min-h-screen overflow-hidden"
    >
      <header className="border-border bg-background/95 sticky top-0 z-50 border-b backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
          <CotaProLogo />
          <nav
            className="text-fg-muted ml-auto hidden items-center gap-6 text-sm md:flex"
            aria-label="Navegação principal"
          >
            <a className="hover:text-fg transition-colors" href="#fluxo">
              Como funciona
            </a>
            <a className="hover:text-fg transition-colors" href="#recursos">
              Recursos
            </a>
            <a className="hover:text-fg transition-colors" href="#controle">
              Controle
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/login">
                Acessar sistema <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-28">
          <div className="relative z-10">
            <div className="bg-primary-soft text-primary mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
              <Sparkles className="size-3.5" aria-hidden />O ciclo de compras em
              um só lugar
            </div>
            <h1 className="text-fg max-w-2xl text-4xl leading-[1.06] font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Compre com clareza. Negocie com histórico. Receba sem surpresa.
            </h1>
            <p className="text-fg-muted mt-6 max-w-xl text-base leading-relaxed sm:text-lg">
              Da necessidade à conferência da nota, o CotaPro organiza decisões,
              conversas e valores para sua operação ganhar ritmo sem perder
              controle.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-5">
                <Link href="/login">
                  Entrar no sistema <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <a href="#fluxo">Conhecer o fluxo</a>
              </Button>
            </div>
            <div className="text-fg-subtle mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {[
                "Cotação por link",
                "WhatsApp integrado",
                "Conferência por NF-e",
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check className="text-success size-3.5" aria-hidden /> {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative lg:pl-4">
            <div
              className="bg-primary-soft absolute -top-8 -right-20 size-56 rounded-full opacity-60"
              aria-hidden
            />
            <div
              className="bg-info-soft absolute -bottom-10 -left-12 size-40 rounded-full opacity-50"
              aria-hidden
            />
            <div className="relative rotate-[0.4deg]">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      <section className="border-border bg-surface border-y">
        <div className="mx-auto grid max-w-7xl gap-px px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            ["Uma operação", "Dados conectados do planejamento ao recebimento"],
            [
              "Menos retrabalho",
              "Associações e regras reaproveitadas automaticamente",
            ],
            [
              "Decisão explicável",
              "Cada indicador abre o caminho até sua origem",
            ],
          ].map(([title, description], index) => (
            <div
              key={title}
              className={cn(
                "py-6 sm:px-7",
                index > 0 && "border-border border-t sm:border-t-0 sm:border-l",
              )}
            >
              <p className="text-fg text-sm font-semibold">{title}</p>
              <p className="text-fg-subtle mt-1 text-xs leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="fluxo"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
      >
        <ScrollReveal className="max-w-2xl">
          <Eyebrow>Fluxo completo</Eyebrow>
          <h2 className="text-fg text-3xl font-semibold tracking-tight sm:text-4xl">
            A compra avança sem perder o contexto.
          </h2>
          <p className="text-fg-muted mt-4 text-base leading-relaxed">
            Cada etapa prepara a próxima. O que foi cotado acompanha o pedido,
            chega à conferência e vira histórico para a negociação seguinte.
          </p>
        </ScrollReveal>

        <div className="mt-12 grid gap-3 md:grid-cols-5">
          {FLOW.map(({ number, title, description, icon: Icon }, index) => (
            <ScrollReveal key={number} delay={index * 70} className="h-full">
              <div className="border-border bg-surface relative flex h-full flex-col rounded-xl border p-4 shadow-xs">
                <div className="mb-7 flex items-center justify-between">
                  <span className="bg-primary-soft text-primary grid size-9 place-items-center rounded-lg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-fg-subtle font-mono text-[10px]">
                    {number}
                  </span>
                </div>
                <h3 className="text-fg text-sm font-semibold">{title}</h3>
                <p className="text-fg-subtle mt-1.5 text-xs leading-relaxed">
                  {description}
                </p>
                {index < FLOW.length - 1 ? (
                  <ArrowRight
                    className="text-border-strong absolute top-7 -right-3 z-10 hidden size-4 md:block"
                    aria-hidden
                  />
                ) : null}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section
        id="recursos"
        className="bg-surface-sunken border-border border-y"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <ScrollReveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>Trabalho bem conectado</Eyebrow>
            <h2 className="text-fg text-3xl font-semibold tracking-tight sm:text-4xl">
              Mais produtividade onde a compra costuma travar.
            </h2>
            <p className="text-fg-muted mt-4 leading-relaxed">
              O sistema reduz as pequenas interrupções que, somadas, consomem o
              dia de quem compra.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }, index) => (
              <ScrollReveal
                key={title}
                delay={(index % 3) * 70}
                className="h-full"
              >
                <article className="border-border bg-surface h-full rounded-xl border p-5 shadow-xs transition-transform hover:-translate-y-0.5">
                  <span className="bg-primary-soft text-primary grid size-10 place-items-center rounded-xl">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <h3 className="text-fg mt-5 text-base font-semibold">
                    {title}
                  </h3>
                  <p className="text-fg-muted mt-2 text-sm leading-relaxed">
                    {description}
                  </p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="controle"
        className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:px-8"
      >
        <ScrollReveal>
          <Eyebrow>Do XML ao histórico</Eyebrow>
          <h2 className="text-fg text-3xl font-semibold tracking-tight sm:text-4xl">
            A nota não encerra apenas um pedido. Ela melhora a próxima compra.
          </h2>
          <p className="text-fg-muted mt-5 max-w-xl leading-relaxed">
            A conferência associa o nome usado pelo fornecedor ao seu catálogo,
            entende caixa, unidade e peso, separa ajustes fiscais e preserva o
            preço realmente praticado.
          </p>
          <ul className="mt-7 space-y-3">
            {[
              "Aprendizado por produto e fornecedor",
              "Conversões para caixa, unidade e quilo",
              "Diferença comercial separada de impostos",
              "Importação retroativa para recuperar histórico",
            ].map((item) => (
              <li
                key={item}
                className="text-fg flex items-center gap-3 text-sm"
              >
                <span className="bg-success-soft text-success grid size-6 place-items-center rounded-full">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <NfePreview />
        </ScrollReveal>
      </section>

      <section className="bg-surface border-border border-y">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <ScrollReveal className="border-border bg-surface-sunken rounded-2xl border p-5 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-fg font-semibold">Jornada do resultado</p>
                <p className="text-fg-subtle mt-1 text-xs">
                  Resultado efetivo vs. cotado
                </p>
              </div>
              <span className="bg-success-soft text-success rounded-full px-2.5 py-1 text-xs font-medium">
                Favorável
              </span>
            </div>
            <p className="text-success mt-6 text-3xl font-semibold tabular-nums">
              + R$ 328,40
            </p>
            <div className="border-border relative mt-8 border-l pl-6">
              {[
                ["12 ago", "Alimentos Sul", "+ R$ 184,60", "success"],
                ["19 ago", "Casa do Frio", "− R$ 42,10", "bad"],
                ["27 ago", "Mercantil SP", "+ R$ 185,90", "success"],
              ].map(([date, supplier, value, tone], index) => (
                <div
                  key={date}
                  className={cn(
                    "relative flex items-center gap-3 py-3",
                    index > 0 && "border-border border-t",
                  )}
                >
                  <span
                    className={cn(
                      "border-surface-sunken absolute -left-[30px] size-3 rounded-full border-2",
                      tone === "success" ? "bg-success" : "bg-destructive",
                    )}
                  />
                  <span className="text-fg-subtle w-12 text-[10px]">
                    {date}
                  </span>
                  <span className="text-fg min-w-0 flex-1 truncate text-xs font-medium">
                    {supplier}
                  </span>
                  <strong
                    className={cn(
                      "text-xs tabular-nums",
                      tone === "success" ? "text-success" : "text-destructive",
                    )}
                  >
                    {value}
                  </strong>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <Eyebrow>Indicadores acionáveis</Eyebrow>
            <h2 className="text-fg text-3xl font-semibold tracking-tight sm:text-4xl">
              Veja o número. E, quando precisar, entenda a história dele.
            </h2>
            <p className="text-fg-muted mt-5 leading-relaxed">
              Resultados efetivos, diferenças entre nota e pedido e divergências
              deixam de ser apenas alertas. Cada valor conduz aos eventos,
              fornecedores e itens que pedem análise.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {[
                "Preço cotado",
                "Preço negociado",
                "Valor recebido",
                "Ajuste fiscal",
              ].map((item) => (
                <span
                  key={item}
                  className="border-border bg-surface-muted text-fg-muted rounded-full border px-3 py-1.5 text-xs"
                >
                  {item}
                </span>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
        <ScrollReveal>
          <div className="border-primary-line bg-primary-soft rounded-2xl border px-6 py-12 text-center sm:px-12">
            <span className="bg-primary text-primary-fg mx-auto grid size-11 place-items-center rounded-xl">
              <History className="size-5" aria-hidden />
            </span>
            <h2 className="text-fg mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Menos tempo procurando respostas. Mais tempo comprando bem.
            </h2>
            <p className="text-fg-muted mx-auto mt-4 max-w-xl leading-relaxed">
              Entre no sistema e acompanhe sua operação completa em uma única
              jornada.
            </p>
            <Button asChild size="lg" className="mt-7 h-11 px-5">
              <Link href="/login">
                Acessar o CotaPro <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </ScrollReveal>
      </section>

      <footer className="border-border bg-surface border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <CotaProLogo compact />
          <p className="text-fg-subtle text-xs">
            Gestão do ciclo de compras e cotações.
          </p>
          <Link
            href="/login"
            className="text-primary text-sm font-medium hover:underline"
          >
            Entrar no sistema
          </Link>
        </div>
      </footer>
    </main>
  );
}
