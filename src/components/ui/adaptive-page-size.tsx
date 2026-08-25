"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const MIN_ROWS = 1;
// Proteção contra parâmetro adulterado/viewport artificial, não limite de UI.
// Cem linhas excedem com folga qualquer monitor de uso normal.
const SAFE_MAX_ROWS = 100;
const FALLBACK_ROW_HEIGHT = 58;
const FALLBACK_CHROME_HEIGHT = 92;
const VIEWPORT_BOTTOM_GAP = 24;

/**
 * Ajusta a paginação à altura real que sobrou abaixo dos filtros.
 *
 * O servidor não conhece a altura da janela. Este marcador mede sua posição
 * depois da hidratação e sincroniza `por_pagina` na URL; assim o recorte ainda
 * é feito no servidor, a página continua compartilhável e não precisamos
 * mandar o catálogo inteiro ao navegador só para paginar no cliente.
 */
export function AdaptivePageSize({
  current,
  minRows = MIN_ROWS,
}: {
  current: number;
  minRows?: number;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const lastRequested = useRef<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let frame = 0;

    const adjust = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = marker.current?.nextElementSibling;
        if (!(card instanceof HTMLElement)) return;

        const cardRect = card.getBoundingClientRect();
        if (cardRect.width === 0 || cardRect.height === 0) return;
        const available = Math.max(
          0,
          window.innerHeight - cardRect.top - VIEWPORT_BOTTOM_GAP,
        );
        // Com poucos registros, a caixa ainda ocupa a área útil e o rodapé
        // fica no mesmo lugar das listas cheias.
        card.style.minHeight = `${available}px`;
        const rows = Array.from(
          card.querySelectorAll<HTMLElement>(
            '[data-slot="table-body"] > [data-slot="table-row"], [data-slot="adaptive-row"]',
          ),
        );
        const measuredRows = rows.filter(
          (row) => row.getBoundingClientRect().height > 0,
        );
        const firstRowRect = measuredRows[0]?.getBoundingClientRect();
        const lastRowRect = measuredRows.at(-1)?.getBoundingClientRect();
        // A distância total também incorpora `gap` entre cards no mobile.
        const rowHeight =
          firstRowRect && lastRowRect
            ? (lastRowRect.bottom - firstRowRect.top) / measuredRows.length
            : FALLBACK_ROW_HEIGHT;
        const headerHeight =
          card
            .querySelector<HTMLElement>('[data-slot="table-header"]')
            ?.getBoundingClientRect().height ?? 0;
        const footer = card.querySelector<HTMLElement>(
          '[data-slot="table-pagination"]',
        );
        const footerHeight = footer?.getBoundingClientRect().height ?? 0;
        // O espaço criado por `margin-top: auto` serve apenas para empurrar a
        // paginação ao rodapé e não pode reduzir a quantidade calculada de
        // linhas. Consideramos somente o `gap` real do contêiner (cards mobile).
        const footerGap = footer
          ? Number.parseFloat(window.getComputedStyle(card).rowGap) || 0
          : 0;
        const extraFooterHeight = Array.from(
          card.querySelectorAll<HTMLElement>(
            '[data-slot="table-extra-footer"]',
          ),
        ).reduce(
          (sum, element) => sum + element.getBoundingClientRect().height,
          0,
        );
        const chromeHeight =
          headerHeight + footerHeight + footerGap + extraFooterHeight ||
          FALLBACK_CHROME_HEIGHT;
        // Arredondar aproveita a última linha quando falta apenas uma fração
        // pequena; `floor` era o que deixava quase uma linha inteira vazia.
        const calculated = Math.round(
          (available - chromeHeight) / rowHeight,
        );
        const next = Math.min(SAFE_MAX_ROWS, Math.max(minRows, calculated));

        if (next === current) {
          lastRequested.current = null;
          return;
        }
        if (lastRequested.current === next) return;
        lastRequested.current = next;

        const params = new URLSearchParams(searchParams.toString());
        params.set("por_pagina", String(next));
        params.delete("pagina");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    };

    adjust();
    window.addEventListener("resize", adjust);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", adjust);
    };
  }, [current, minRows, pathname, router, searchParams]);

  return <span ref={marker} className="block h-0" aria-hidden />;
}
