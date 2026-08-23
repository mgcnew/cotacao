"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useState } from "react";

type Props = Omit<ComponentProps<typeof Link>, "prefetch">;

/**
 * Prefaz a rota completa somente depois de uma intenção real do usuário.
 *
 * Nas tabelas, o prefetch automático renderizaria no servidor cada ficha que
 * entrou no viewport. Desligá-lo por completo economiza banco, mas devolve a
 * latência inteira no clique. Hover, foco por teclado ou toque antecipam só a
 * ficha que provavelmente será aberta.
 */
export function IntentPrefetchLink({
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Props) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
