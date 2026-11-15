import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  FileCheck2,
  Link2,
  MessageCircle,
} from "lucide-react";

import { CotaProLogo } from "@/components/brand/cotapro-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "CotaPro — compare cotações com o preço que você realmente pagou",
  description:
    "O fornecedor responde por link, a negociação segue no WhatsApp e a NF-e de cada entrega vira o histórico da próxima compra.",
};

/*
 * A página conta uma rodada de ponta a ponta com o mesmo item fictício: o
 * contrafilé cotado no topo é o que o fornecedor responde pelo link, o que se
 * negocia na conversa e o que a nota confirma no fim. Fornecedores e valores
 * são ilustrativos — não há cliente nem número real aqui.
 */

const LAST_PAID = 38.9;

const QUOTES = [
  { supplier: "Frigorífico Serra Azul", time: "08:52", price: 39.8 },
  { supplier: "Distribuidora Boa Carne", time: "09:12", price: 37.95 },
  { supplier: "Casa de Carnes do Vale", time: "09:31", price: 38.6 },
  { supplier: "Atacado Central", time: null, price: null },
] as const;

const BEST_PRICE = Math.min(
  ...QUOTES.flatMap(({ price }) => (price === null ? [] : [price])),
);

const CYCLE = [
  {
    title: "Planeje",
    where: "Lista de compras e agenda",
    description:
      "A demanda da loja vira itens de uma rodada, no dia de cada fornecedor.",
  },
  {
    title: "Cote",
    where: "Link por fornecedor",
    description:
      "Cada fornecedor recebe pelo WhatsApp um link só dele e responde do celular.",
  },
  {
    title: "Decida",
    where: "Comparação",
    description:
      "As respostas ficam lado a lado com o último preço pago em nota.",
  },
  {
    title: "Acompanhe",
    where: "Pedido e conversa",
    description:
      "O pedido sai pelo WhatsApp e a confirmação volta para a mesma rodada.",
  },
  {
    title: "Confira",
    where: "NF-e",
    description:
      "A nota é conferida contra o pedido e o preço pago entra no histórico.",
  },
] as const;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function signedBrl(value: number) {
  return `${value > 0 ? "+" : "−"} ${brl.format(Math.abs(value))}`;
}

function arrive(delay: number): CSSProperties {
  return { "--arrive-delay": `${delay}ms` } as CSSProperties;
}

/** O argumento da página: as respostas chegando contra o preço já pago. */
function QuoteSheet() {
  const savings = (LAST_PAID - BEST_PRICE) / LAST_PAID;

  return (
    <figure className="border-border bg-surface min-w-0 overflow-hidden rounded-xl border shadow-[0_24px_48px_-24px_rgba(26,31,54,0.28),0_2px_4px_rgba(26,31,54,0.05)]">
      <figcaption className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-fg truncate text-sm font-semibold">
            Contrafilé resfriado
          </p>
          <p className="text-fg-subtle text-xs">Rodada da semana · 120 kg</p>
        </div>
        <span className="bg-info-soft text-info shrink-0 rounded-[4px] px-1.5 py-0.5 text-xs font-medium tabular-nums">
          3 de 4 responderam
        </span>
      </figcaption>

      <ul className="divide-border divide-y">
        {QUOTES.map(({ supplier, time, price }, index) => {
          const best = price === BEST_PRICE;
          return (
            <li
              key={supplier}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 sm:px-5",
                best && "bg-success-soft/60",
              )}
            >
              <div className="min-w-0">
                <p className="text-fg truncate text-sm font-medium">
                  {supplier}
                </p>
                <p className="text-fg-subtle mt-0.5 flex items-center gap-1.5 text-xs">
                  {time ? (
                    <>
                      <Link2 className="size-3" aria-hidden />
                      <span className="tabular-nums">
                        Pelo link · {time}
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="size-3" aria-hidden />
                      Aguardando resposta
                    </>
                  )}
                </p>
              </div>

              {price === null ? (
                <span className="text-fg-subtle text-right text-xl tabular-nums">
                  —
                </span>
              ) : (
                <div
                  className="quote-arrive text-right"
                  style={arrive(350 + index * 420)}
                >
                  <p
                    className={cn(
                      "text-xl font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl",
                      best ? "text-success" : "text-fg",
                    )}
                  >
                    {brl.format(price)}
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      price < LAST_PAID ? "text-success" : "text-fg-subtle",
                    )}
                  >
                    {signedBrl(price - LAST_PAID)} vs. pago
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-border bg-surface-sunken flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 sm:px-5">
        <p className="text-fg-muted flex items-center gap-1.5 text-xs">
          <FileCheck2 className="size-3.5" aria-hidden />
          <span>
            Última NF-e paga:{" "}
            <strong className="text-fg font-semibold tabular-nums">
              {brl.format(LAST_PAID)}/kg
            </strong>
          </span>
        </p>
        <p
          className="quote-arrive text-success text-xs font-medium tabular-nums"
          style={arrive(1650)}
        >
          Melhor resposta{" "}
          {savings.toLocaleString("pt-BR", {
            style: "percent",
            maximumFractionDigits: 1,
          })}{" "}
          abaixo do pago
        </p>
      </div>
    </figure>
  );
}

/** A tela que o fornecedor abre pelo link, sempre clara como a real. */
function SupplierPhone() {
  const items = [
    { name: "Contrafilé resfriado", amount: "120 kg", value: "37,95" },
    { name: "Picanha bovina", amount: "40 kg", value: "69,90" },
    { name: "Fraldinha", amount: "60 kg", value: null },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.25rem] bg-[#1a1f36] p-2.5 shadow-[0_24px_48px_-24px_rgba(26,31,54,0.45)]">
      <div
        className="overflow-hidden rounded-[1.75rem] bg-[#f6f8fa] text-[#1a1f36]"
        aria-label="Exemplo da cotação aberta pelo fornecedor no celular"
        role="img"
      >
        <div className="bg-white px-4 pt-6 pb-3">
          <p className="text-xs text-[#5f6b7d]">Mercado da Esquina pede</p>
          <p className="text-[15px] font-semibold">Cotação de carnes</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-[#8f6100]">
            <Clock className="size-3" aria-hidden />
            Responder até hoje, 17h
          </p>
        </div>
        <ul className="space-y-2 p-3">
          {items.map(({ name, amount, value }) => (
            <li
              key={name}
              className="rounded-lg border border-[#e3e8ee] bg-white p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-medium">{name}</p>
                <p className="shrink-0 text-xs text-[#5f6b7d] tabular-nums">
                  {amount}
                </p>
              </div>
              {value ? (
                <div className="mt-2 flex h-9 items-center rounded-md border border-[#c9d1db] px-2.5 text-[13px] tabular-nums">
                  <span className="mr-1.5 text-[#5f6b7d]">R$</span>
                  {value}
                  <span className="ml-auto text-xs text-[#5f6b7d]">/kg</span>
                </div>
              ) : (
                <div className="mt-2 flex h-9 items-center justify-center rounded-md bg-[#f2f4f7] text-xs font-medium text-[#4f566b]">
                  Não tenho este item
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="px-3 pb-5">
          <div className="flex h-10 items-center justify-center rounded-md bg-[#5851ea] text-[13px] font-medium text-white">
            Enviar preços
          </div>
        </div>
      </div>
    </div>
  );
}

/** A conversa do WhatsApp presa à rodada, com o que ela muda no sistema. */
function NegotiationThread() {
  return (
    <div className="border-border bg-surface min-w-0 rounded-xl border">
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <span className="bg-surface-muted text-fg-muted grid size-8 place-items-center rounded-md">
          <MessageCircle className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-fg truncate text-sm font-semibold">
            Distribuidora Boa Carne
          </p>
          <p className="text-fg-subtle text-xs">WhatsApp · na rodada da semana</p>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        <p className="bg-surface-muted text-fg max-w-[85%] rounded-lg rounded-tl-sm px-3 py-2">
          Mandei os preços. Se fechar 150 kg do contrafilé, faço a R$ 37,50.
        </p>
        <p className="border-border bg-surface-sunken text-fg ml-auto max-w-[85%] rounded-lg rounded-tr-sm border px-3 py-2">
          Fechado, 150 kg a R$ 37,50. Já te mando o pedido.
        </p>

        <div className="border-border space-y-2 border-t pt-3">
          <p className="text-fg-muted flex items-center gap-2 text-xs">
            <span className="bg-info-soft text-info rounded-[4px] px-1.5 py-0.5 font-medium">
              Negociado
            </span>
            <span className="tabular-nums">
              Contrafilé de R$ 37,95 para R$ 37,50/kg
            </span>
          </p>
          <p className="text-fg-muted flex items-center gap-2 text-xs">
            <span className="bg-success-soft text-success rounded-[4px] px-1.5 py-0.5 font-medium">
              Enviado
            </span>
            <span className="tabular-nums">Pedido 384 · você confirmou o envio</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** A conferência fecha a mesma compra e devolve o preço pago à próxima. */
function InvoiceCheck() {
  const lines = [
    {
      fiscal: "CONTRAFILE RESF KG",
      product: "Contrafilé resfriado",
      detail: "150 kg × R$ 37,50",
      issue: null,
    },
    {
      fiscal: "PICANHA BOV CX 18KG",
      product: "Picanha bovina",
      detail: "2 cx = 36 kg × R$ 69,90",
      issue: null,
    },
    {
      fiscal: "FRALDINHA BOV KG",
      product: "Fraldinha",
      detail: "58,4 kg de 60 kg pedidos",
      issue: "1,6 kg a menos",
    },
  ] as const;

  return (
    <div className="border-border bg-surface min-w-0 rounded-xl border">
      <div className="border-border flex items-start justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-fg text-sm font-semibold">Conferência da NF-e</p>
          <p className="text-fg-subtle text-xs tabular-nums">
            Nota 000.148 · pedido 384 · 3 itens
          </p>
        </div>
        <span className="bg-warning-soft text-warning shrink-0 rounded-[4px] px-1.5 py-0.5 text-xs font-medium">
          1 divergência
        </span>
      </div>

      <ul className="divide-border divide-y">
        {lines.map(({ fiscal, product, detail, issue }) => (
          <li key={fiscal} className="flex gap-3 px-4 py-3 sm:px-5">
            {issue ? (
              <AlertTriangle
                className="text-warning mt-0.5 size-4 shrink-0"
                aria-label="Divergência"
              />
            ) : (
              <Check
                className="text-success mt-0.5 size-4 shrink-0"
                aria-label="Conferido"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-fg text-sm font-medium">{product}</p>
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    issue ? "text-warning font-medium" : "text-fg-muted",
                  )}
                >
                  {issue ?? detail}
                </p>
              </div>
              <p className="text-fg-subtle mt-0.5 truncate text-xs">
                Na nota: {fiscal}
                {issue ? ` · ${detail}` : null}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-border bg-surface-sunken flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs sm:px-5">
        <span className="text-fg-muted">Entra no histórico de preço</span>
        <strong className="text-fg font-semibold tabular-nums">
          Contrafilé · R$ 37,50/kg pago
        </strong>
      </div>
    </div>
  );
}

const sectionHeading =
  "text-fg text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-4xl";

export default function HomePage() {
  return (
    <main
      data-slot="landing-page"
      className="bg-background min-h-screen overflow-x-clip"
    >
      <header className="border-border bg-background/95 sticky top-0 z-50 border-b backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-4 sm:px-6">
          <CotaProLogo compact className="sm:hidden" />
          <CotaProLogo className="hidden sm:flex" />
          <nav
            className="text-fg-muted ml-auto hidden items-center gap-6 text-sm md:flex"
            aria-label="Navegação principal"
          >
            <a className="hover:text-fg transition-colors" href="#fornecedor">
              Fornecedor
            </a>
            <a className="hover:text-fg transition-colors" href="#nota">
              Nota fiscal
            </a>
            <a className="hover:text-fg transition-colors" href="#ciclo">
              Como funciona
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <Button asChild>
              <Link href="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pt-24 lg:pb-28">
        <div>
          <h1 className="text-fg text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-[3.5rem]">
            Compare as cotações com o que você realmente pagou.
          </h1>
          <p className="text-fg-muted mt-6 max-w-[34rem] text-base leading-relaxed text-pretty sm:text-lg">
            O fornecedor responde por link, sem cadastro. A conversa segue no
            WhatsApp. E a NF-e de cada entrega vira o histórico que embasa a
            próxima decisão.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href="/login">
                Entrar no CotaPro <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5">
              <a href="#ciclo">Ver como funciona</a>
            </Button>
          </div>
        </div>

        <QuoteSheet />
      </section>

      <section
        id="fornecedor"
        className="border-border bg-surface-sunken border-y"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="lg:order-2">
            <h2 className={sectionHeading}>
              O fornecedor responde sem criar conta.
            </h2>
            <p className="text-fg-muted mt-5 max-w-[34rem] text-base leading-relaxed text-pretty">
              Ele recebe pelo WhatsApp um link só dele, vê apenas os itens que
              você pediu e informa o preço, ou que não tem, direto do celular.
              Sem cadastro, sem senha, sem aplicativo.
            </p>
            <dl className="border-border mt-8 grid max-w-[34rem] gap-px border-t sm:grid-cols-2">
              <div className="pt-4 sm:pr-6">
                <dt className="text-fg text-sm font-semibold">
                  A resposta cai na rodada
                </dt>
                <dd className="text-fg-muted mt-1 text-sm leading-relaxed">
                  Ninguém copia preço de mensagem para planilha.
                </dd>
              </div>
              <div className="pt-4">
                <dt className="text-fg text-sm font-semibold">
                  Prazo visível para ele
                </dt>
                <dd className="text-fg-muted mt-1 text-sm leading-relaxed">
                  O link mostra até quando a cotação vale.
                </dd>
              </div>
            </dl>
          </div>
          <SupplierPhone />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-20">
        <div>
          <h2 className={sectionHeading}>
            A negociação continua sendo conversa.
          </h2>
          <p className="text-fg-muted mt-5 max-w-[34rem] text-base leading-relaxed text-pretty">
            Telefone e WhatsApp seguem no fluxo, sem robô no meio. O que foi
            acertado fica registrado na rodada, e o pedido só sai quando alguém
            confirma o envio.
          </p>
        </div>
        <NegotiationThread />
      </section>

      <section id="nota" className="border-border bg-surface border-y">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div className="lg:order-2">
            <h2 className={sectionHeading}>
              A nota fecha o ciclo e ensina a próxima compra.
            </h2>
            <p className="text-fg-muted mt-5 max-w-[34rem] text-base leading-relaxed text-pretty">
              O fornecedor não cita o seu pedido na NF-e, então a conferência
              casa a nota pelo conteúdo. Ela reconhece o nome que cada
              fornecedor usa, converte caixa em quilo e separa a diferença
              comercial do imposto.
            </p>
            <ul className="text-fg mt-7 space-y-2.5 text-sm">
              {[
                "Aprende o nome de cada produto por fornecedor",
                "Converte caixa, unidade e quilo",
                "Aponta a falta antes de o pedido ser fechado",
                "Importa notas antigas para recuperar o histórico",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check
                    className="text-success mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <InvoiceCheck />
        </div>
      </section>

      <section
        id="ciclo"
        className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20"
      >
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className={sectionHeading}>
            Da lista da loja ao preço pago, uma rodada só.
          </h2>
          <p className="text-fg-muted mt-5 max-w-[30rem] text-base leading-relaxed text-pretty">
            Cada etapa prepara a próxima. O que foi cotado acompanha o pedido,
            chega à conferência e volta como referência na rodada seguinte.
          </p>
        </div>

        <ol className="relative">
          {CYCLE.map(({ title, where, description }, index) => (
            <li key={title} className="relative flex gap-5 pb-9 last:pb-0">
              {index < CYCLE.length - 1 ? (
                <span
                  className="bg-border absolute top-4 left-[5px] h-full w-px"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2",
                  index === CYCLE.length - 1
                    ? "border-success bg-success"
                    : "border-border-strong bg-background",
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-fg text-lg font-semibold tracking-[-0.01em]">
                    {title}
                  </h3>
                  <span className="text-fg-subtle text-xs">{where}</span>
                </div>
                <p className="text-fg-muted mt-1 max-w-[30rem] text-sm leading-relaxed">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-border bg-surface-sunken border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="text-fg max-w-xl text-2xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
            A próxima rodada começa com o preço da última nota.
          </h2>
          <Button asChild size="lg" className="h-11 shrink-0 px-5">
            <Link href="/login">
              Entrar no CotaPro <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-border bg-surface border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <CotaProLogo compact />
          <p className="text-fg-subtle text-xs">
            Gestão do ciclo de compras e cotações.
          </p>
        </div>
      </footer>
    </main>
  );
}
