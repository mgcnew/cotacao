"use client";

import {
  BadgeDollarSign,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Scale,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DashboardMetric } from "@/components/dashboard/dashboard-metric";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  FinancialJourney,
  FinancialJourneyEvent,
  FinancialJourneyMetric,
} from "@/features/dashboard/financial-journey-types";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const PERIOD = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

type Tone = "neutral" | "good" | "bad";
type LoadState =
  | { status: "idle" | "loading"; data: null; error: null }
  | { status: "success"; data: FinancialJourney; error: null }
  | { status: "error"; data: null; error: string };

const DEFINITIONS = {
  realized: {
    label: "Resultado efetivo vs. cotado",
    hint: "Proposta original menos preço e quantidade conferidos",
    description:
      "Mostra como cada recebimento aumentou ou reduziu o resultado em relação à proposta original.",
    formula: "(preço cotado − preço da nota) × quantidade recebida",
    icon: BadgeDollarSign,
  },
  divergence: {
    label: "Diferença da nota x pedido",
    hint: "Nota menos pedido: positivo indica valor pago a mais",
    description:
      "Mostra como cada recebimento formou a diferença entre o valor combinado no pedido e o conferido na nota.",
    formula: "(preço da nota − preço do pedido) × quantidade recebida",
    icon: Scale,
  },
} as const;

function signedMoney(value: number) {
  return value > 0 ? `+${MONEY.format(value)}` : MONEY.format(value);
}

function isFavorable(metric: FinancialJourneyMetric, value: number) {
  return metric === "realized" ? value > 0 : value < 0;
}

function contributionClass(metric: FinancialJourneyMetric, value: number) {
  if (value === 0) return "text-fg-muted";
  return isFavorable(metric, value) ? "text-success" : "text-destructive";
}

function EventCard({
  event,
  metric,
  timezone,
}: {
  event: FinancialJourneyEvent;
  metric: FinancialJourneyMetric;
  timezone: string;
}) {
  const favorable = isFavorable(metric, event.contribution);
  const receivedAt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.receivedAt));

  return (
    <li className="relative pl-7">
      <span
        className={cn(
          "border-surface absolute top-4 left-0 z-10 size-3 rounded-full border-2",
          event.contribution === 0
            ? "bg-fg-subtle"
            : favorable
              ? "bg-success"
              : "bg-destructive",
        )}
        aria-hidden
      />
      <details className="group border-border bg-surface rounded-xl border shadow-xs">
        <summary className="focus-visible:ring-ring/40 cursor-pointer list-none rounded-xl p-3 outline-none focus-visible:ring-3 sm:p-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-fg text-sm font-semibold">{receivedAt}</p>
              <p className="text-fg-muted mt-0.5 truncate text-xs">
                {event.supplierName}
                {event.orderNumber ? ` · Pedido #${event.orderNumber}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right">
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    contributionClass(metric, event.contribution),
                  )}
                >
                  {signedMoney(event.contribution)}
                </p>
                <p className="text-fg-subtle text-[11px] tabular-nums">
                  saldo {MONEY.format(event.balanceAfter)}
                </p>
              </div>
              <ChevronDown
                className="text-fg-subtle size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </div>
          </div>

          <div className="text-fg-subtle mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums">
            <span>{MONEY.format(event.balanceBefore)}</span>
            <span aria-hidden>→</span>
            <span className={contributionClass(metric, event.contribution)}>
              {signedMoney(event.contribution)}
            </span>
            <span aria-hidden>→</span>
            <strong className="text-fg font-medium">
              {MONEY.format(event.balanceAfter)}
            </strong>
          </div>
        </summary>

        <div className="border-border border-t px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="divide-border divide-y">
            {event.items.map((item, index) => (
              <div
                key={`${item.productId ?? "produto"}-${index}`}
                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-fg truncate text-xs font-medium">
                    {item.productName}
                  </p>
                  <p className="text-fg-subtle mt-0.5 text-[11px] tabular-nums">
                    {metric === "realized"
                      ? `${item.quoted === null ? "Sem preço cotado" : MONEY.format(item.quoted)} − ${MONEY.format(item.practiced)}`
                      : `${MONEY.format(item.practiced)} − ${MONEY.format(item.agreed)}`}{" "}
                    × {item.quantity.toLocaleString("pt-BR")}
                  </p>
                </div>
                <strong
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    contributionClass(metric, item.contribution),
                  )}
                >
                  {signedMoney(item.contribution)}
                </strong>
              </div>
            ))}
          </div>

          <div className="mt-1 flex flex-wrap gap-2">
            {event.orderId ? (
              <Button asChild variant="outline" size="xs">
                <Link href={`/pedidos/${event.orderId}`}>
                  Ver pedido <ExternalLink aria-hidden />
                </Link>
              </Button>
            ) : null}
            {event.receiptId ? (
              <Button asChild variant="outline" size="xs">
                <Link href={`/recebimentos/${event.receiptId}`}>
                  Ver recebimento <ExternalLink aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </details>
    </li>
  );
}

export function FinancialJourneyMetric({
  metric,
  value,
  tone,
  de,
  ate,
  timezone,
}: {
  metric: FinancialJourneyMetric;
  value: number;
  tone: Tone;
  de: string;
  ate: string;
  timezone: string;
}) {
  const definition = DEFINITIONS[metric];
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({
    status: "idle",
    data: null,
    error: null,
  });

  async function load() {
    setState({ status: "loading", data: null, error: null });
    try {
      const query = new URLSearchParams({ metric, de, ate });
      const response = await fetch(
        `/api/dashboard/financial-journey?${query.toString()}`,
      );
      const body = (await response.json()) as
        FinancialJourney | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Não foi possível carregar o detalhamento.",
        );
      }
      setState({
        status: "success",
        data: body as FinancialJourney,
        error: null,
      });
    } catch (cause) {
      setState({
        status: "error",
        data: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar o detalhamento.",
      });
    }
  }

  function openJourney() {
    setOpen(true);
    if (state.status === "idle") void load();
  }

  return (
    <>
      <DashboardMetric
        icon={definition.icon}
        label={definition.label}
        value={MONEY.format(value)}
        hint={`${definition.hint} · Ver memória de cálculo`}
        tone={tone}
        onClick={openJourney}
        actionLabel={`Ver memória de cálculo de ${definition.label}`}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{definition.label}</DialogTitle>
            <DialogDescription>
              Memória de cálculo de {PERIOD.format(new Date(`${de}T12:00:00`))}{" "}
              a {PERIOD.format(new Date(`${ate}T12:00:00`))}.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="bg-surface-sunken py-4">
            <div className="border-border bg-surface rounded-xl border p-3 sm:p-4">
              <p className="text-fg-muted text-xs leading-relaxed">
                {definition.description}
              </p>
              <p className="text-fg mt-2 text-xs font-medium">
                Cálculo por item: {definition.formula}
              </p>
            </div>

            {state.status === "loading" || state.status === "idle" ? (
              <div
                className="text-fg-muted flex min-h-56 items-center justify-center gap-2 text-sm"
                role="status"
              >
                <RefreshCw className="size-4 animate-spin" aria-hidden />
                Carregando a jornada…
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <p className="text-destructive text-sm">{state.error}</p>
                <Button variant="outline" onClick={() => void load()}>
                  <RefreshCw aria-hidden /> Tentar novamente
                </Button>
              </div>
            ) : null}

            {state.status === "success" ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="border-border bg-surface col-span-3 rounded-xl border p-3 sm:col-span-1">
                    <p className="text-fg-subtle text-[11px]">
                      Resultado no período
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-lg font-semibold tabular-nums",
                        contributionClass(metric, state.data.total),
                      )}
                    >
                      {MONEY.format(state.data.total)}
                    </p>
                  </div>
                  <div className="border-border bg-surface rounded-xl border p-3">
                    <p className="text-fg-subtle text-[11px]">Recebimentos</p>
                    <p className="text-fg mt-1 text-lg font-semibold tabular-nums">
                      {state.data.events.length}
                    </p>
                  </div>
                  <div className="border-border bg-surface rounded-xl border p-3">
                    <p className="text-fg-subtle text-[11px]">
                      Itens calculados
                    </p>
                    <p className="text-fg mt-1 text-lg font-semibold tabular-nums">
                      {state.data.itemCount}
                    </p>
                  </div>
                </div>

                {state.data.events.length === 0 ? (
                  <div className="border-border bg-surface mt-3 rounded-xl border border-dashed px-4 py-10 text-center">
                    <p className="text-fg text-sm font-medium">
                      Nenhuma cotação vinculada aos recebimentos do período
                    </p>
                    <p className="text-fg-muted mt-1 text-xs">
                      Pedidos diretos entram no valor recebido, mas não possuem
                      comparação com proposta.
                    </p>
                  </div>
                ) : (
                  <ol className="before:bg-border relative mt-4 space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[5px] before:w-px">
                    {state.data.events.map((event, index) => (
                      <EventCard
                        key={`${event.receiptId ?? "evento"}-${index}`}
                        event={event}
                        metric={metric}
                        timezone={timezone}
                      />
                    ))}
                  </ol>
                )}
              </>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
