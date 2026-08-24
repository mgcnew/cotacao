"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const MIN_ROWS = 6;
const MAX_ROWS = 15;
const BOTTOM_GAP = 24;

/**
 * Ajusta a paginação à altura real que sobrou abaixo dos filtros.
 *
 * O servidor não conhece a altura da janela. Este marcador mede sua posição
 * depois da hidratação e sincroniza `por_pagina` na URL; assim o recorte ainda
 * é feito no servidor, a página continua compartilhável e não precisamos
 * mandar o catálogo inteiro ao navegador só para paginar no cliente.
 */
export function AdaptivePageSize({ current }: { current: number }) {
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
        const top = marker.current?.getBoundingClientRect().top;
        if (top === undefined) return;

        const desktop = window.matchMedia("(min-width: 640px)").matches;
        const rowHeight = desktop ? 58 : 72;
        const tableChromeHeight = desktop ? 92 : 132;
        const available = window.innerHeight - top - BOTTOM_GAP;
        const calculated = Math.floor(
          (available - tableChromeHeight) / rowHeight,
        );
        const next = Math.min(MAX_ROWS, Math.max(MIN_ROWS, calculated));

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
  }, [current, pathname, router, searchParams]);

  return <span ref={marker} className="block h-0" aria-hidden />;
}
