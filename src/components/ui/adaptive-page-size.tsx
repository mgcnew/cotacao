"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useMemo, useRef } from "react";

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
  basePath,
  minRows = MIN_ROWS,
  fallbackRowHeight = FALLBACK_ROW_HEIGHT,
}: {
  current: number;
  /** Rota da lista. Modais interceptados mudam `usePathname`, mas não podem
   * recalcular nem reescrever a paginação da tela que ficou ao fundo. */
  basePath: string;
  minRows?: number;
  /** Usado somente enquanto ainda não existe uma linha mensurável. */
  fallbackRowHeight?: number;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const lastRequested = useRef<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = pathname === basePath;
  const latestParams = useRef("");
  const paramsString = searchParams.toString();

  useLayoutEffect(() => {
    if (active) latestParams.current = paramsString;
  }, [active, paramsString]);

  // Trocar somente `pagina` ou `por_pagina` não altera o espaço disponível.
  // Excluí-los impede uma segunda medição concorrente durante a navegação.
  const layoutKey = useMemo(() => {
    if (!active) return "inactive";
    const params = new URLSearchParams(paramsString);
    params.delete("pagina");
    params.delete("por_pagina");
    return params.toString();
  }, [active, paramsString]);

  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;

    const adjustNow = () => {
      const card = marker.current?.nextElementSibling;
      if (!(card instanceof HTMLElement)) return;

      const cardRect = card.getBoundingClientRect();
      if (cardRect.width === 0) return;

      // Conteúdos explicitamente marcados depois da tabela também precisam
      // caber na viewport. Em Produtos, os atalhos de manutenção eram a parte
      // esquecida que sempre criava rolagem apesar da tabela "adaptativa".
      const trailingHeight = Array.from(
        marker.current?.parentElement?.querySelectorAll<HTMLElement>(
          '[data-slot="adaptive-page-trailing"]',
        ) ?? [],
      ).reduce((sum, element) => {
        const style = window.getComputedStyle(element);
        return (
          sum +
          element.getBoundingClientRect().height +
          (Number.parseFloat(style.marginTop) || 0) +
          (Number.parseFloat(style.marginBottom) || 0)
        );
      }, 0);
      const available = Math.max(
        0,
        window.innerHeight -
          cardRect.top -
          VIEWPORT_BOTTOM_GAP -
          trailingHeight,
      );

      // Altura, e não min-height: o quadro fica contido na viewport desde o
      // primeiro paint e o rodapé da paginação não salta entre respostas RSC.
      card.style.height = `${available}px`;
      card.style.minHeight = "0";

      const rows = Array.from(
        card.querySelectorAll<HTMLElement>(
          '[data-slot="table-body"] > [data-slot="table-row"], [data-slot="adaptive-row"]',
        ),
      );
      const measuredRows = rows.filter(
        (row) => row.getBoundingClientRect().height > 0,
      );
      const rowGap =
        Number.parseFloat(window.getComputedStyle(card).rowGap) || 0;
      // A maior linha, e não a média: uma observação ou aviso mais alto não
      // pode ser compensado por linhas curtas e acabar cortado no fim.
      const measuredRowHeight = measuredRows.reduce(
        (largest, row) =>
          Math.max(largest, row.getBoundingClientRect().height),
        0,
      );
      const rowHeight =
        measuredRowHeight > 0
          ? measuredRowHeight + (measuredRows.length > 1 ? rowGap : 0)
          : fallbackRowHeight;
      const headerHeight =
        card
          .querySelector<HTMLElement>('[data-slot="table-header"]')
          ?.getBoundingClientRect().height ?? 0;
      const footer = card.querySelector<HTMLElement>(
        '[data-slot="table-pagination"]',
      );
      const footerHeight = footer?.getBoundingClientRect().height ?? 0;
      const footerGap = footer ? rowGap : 0;
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
      // `floor` é intencional: preencher meia linha a mais contradiz a função
      // principal deste componente, que é impedir qualquer rolagem vertical.
      const calculated = Math.floor(
        (available - chromeHeight) / rowHeight,
      );
      const next = Math.min(SAFE_MAX_ROWS, Math.max(minRows, calculated));

      if (next === current) {
        lastRequested.current = null;
        return;
      }
      if (lastRequested.current === next) return;
      lastRequested.current = next;

      const params = new URLSearchParams(latestParams.current);
      params.set("por_pagina", String(next));
      const query = params.toString();
      router.replace(query ? `${basePath}?${query}` : basePath, {
        scroll: false,
      });
    };

    const scheduleAdjust = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(adjustNow);
    };

    // `useLayoutEffect` executa antes do quadro chegar à tela: a altura e o
    // rodapé já nascem no lugar certo, sem o clarão visto com `useEffect`.
    adjustNow();
    window.addEventListener("resize", scheduleAdjust);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleAdjust);
    };
  }, [
    active,
    basePath,
    current,
    fallbackRowHeight,
    layoutKey,
    minRows,
    router,
  ]);

  return <span ref={marker} className="block h-0" aria-hidden />;
}
