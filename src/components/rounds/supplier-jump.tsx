"use client";

import type { ReactNode } from "react";

/**
 * Uma linha do placar leva à seção do fornecedor. A seção é um `<details>`
 * fechado, e navegar pelo `#id` só rola até ele sem abrir — então o clique
 * abre e rola. O `href` continua lá para abrir em nova aba e para leitores
 * de tela anunciarem como link.
 */
export function SupplierJump({
  targetId,
  className,
  children,
}: {
  targetId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (!(target instanceof HTMLDetailsElement)) return;
        event.preventDefault();
        target.open = true;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.querySelector("summary")?.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}
