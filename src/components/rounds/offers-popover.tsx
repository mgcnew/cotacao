"use client";

import { Scale } from "lucide-react";
import { Popover } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export type Offer = {
  supplierId: string;
  name: string;
  price: number;
  /** Preço antes de negociar, quando houve negociação. */
  quotedPrice: number | null;
  negotiated: boolean;
  /** Preço na unidade de comparação, quando as propostas têm base comum. */
  comparisonPrice: number | null;
};

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Todas as ofertas recebidas para um produto, ao lado do preço da decisão.
 *
 * Existe para a pergunta que a pessoa se faz na hora de decidir — "e os
 * outros, quanto pediram?" — sem sair da tela nem abrir a comparação inteira.
 *
 * No desktop abre ao passar o mouse; no celular, ao tocar. O toque é o caminho
 * de verdade (não há hover), então o clique do mouse não pode fechar o que o
 * hover acabou de abrir: o mouse só abre, e o toque e o teclado alternam.
 */
export function OffersPopover({
  productName,
  unit,
  comparisonUnit,
  chosenSupplierId,
  offers,
  withoutOffer,
}: {
  productName: string;
  unit: string;
  comparisonUnit: string | null;
  chosenSupplierId: string;
  offers: Offer[];
  /** Fornecedores da rodada que não deram preço para este produto. */
  withoutOffer: number;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    // Folga para o ponteiro atravessar o vão entre o ícone e o balão.
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  React.useEffect(() => cancelClose, []);

  const basis = (offer: Offer) => offer.comparisonPrice ?? offer.price;
  const best = Math.min(...offers.map(basis));
  const useComparison = offers.every((offer) => offer.comparisonPrice !== null);
  const shownUnit = useComparison && comparisonUnit ? comparisonUnit : unit;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Ver os preços de todos os fornecedores para ${productName}`}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") scheduleClose();
          }}
          onClick={(event) => {
            // O mouse já abriu pelo hover: clicar não deve fechar.
            if ((event.nativeEvent as PointerEvent).pointerType === "mouse") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="text-fg-subtle hover:text-fg hover:bg-surface-sunken focus-visible:ring-ring inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 sm:size-8"
        >
          <Scale className="size-4" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          onPointerEnter={cancelClose}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") scheduleClose();
          }}
          // Abrir por hover não deve roubar o foco de quem está no teclado.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="border-border bg-popover text-fg z-[100] w-72 max-w-[calc(100vw-1rem)] rounded-lg border p-3 text-sm shadow-lg"
        >
          <p className="text-fg mb-2 font-semibold wrap-anywhere">
            {productName}
          </p>
          <ul className="flex flex-col gap-1.5">
            {offers.map((offer) => {
              const diff = basis(offer) / best - 1;
              const chosen = offer.supplierId === chosenSupplierId;
              const cheapest = basis(offer) === best;
              return (
                <li
                  key={offer.supplierId}
                  className={cn(
                    "flex items-baseline justify-between gap-3 rounded-md px-2 py-1",
                    chosen && "bg-primary-soft",
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block wrap-anywhere",
                        chosen && "font-semibold",
                      )}
                    >
                      {offer.name}
                    </span>
                    {chosen || cheapest ? (
                      <span className="text-fg-muted block text-[12px]">
                        {[
                          chosen ? "nesta decisão" : null,
                          cheapest ? "menor preço" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span
                      className={cn(
                        "block font-medium",
                        cheapest && "text-success",
                      )}
                    >
                      {MONEY.format(basis(offer))}
                      <span className="text-fg-muted text-[12px] font-normal">
                        /
                        {useComparison && comparisonUnit
                          ? comparisonUnit
                          : unit}
                      </span>
                    </span>
                    {offer.negotiated &&
                    offer.quotedPrice !== null &&
                    offer.quotedPrice !== offer.price ? (
                      <span className="text-fg-subtle block text-[12px] line-through">
                        {MONEY.format(offer.quotedPrice)}
                      </span>
                    ) : null}
                    {!cheapest ? (
                      <span className="text-fg-muted block text-[12px]">
                        +{Math.max(1, Math.round(diff * 100))}%
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-fg-subtle mt-2 text-[12px]">
            Preço por {shownUnit}
            {offers.some((offer) => offer.negotiated)
              ? "; riscado, antes da negociação"
              : ""}
            {withoutOffer > 0
              ? `. ${withoutOffer} ${withoutOffer === 1 ? "fornecedor sem preço" : "fornecedores sem preço"}`
              : ""}
            .
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
