"use client";

import { CheckCircle2 } from "lucide-react";
import * as React from "react";

/**
 * Aviso curto de que algo deu certo.
 *
 * Para as ações que terminam fechando um modal: o modal some e, sem o aviso, a
 * tarefa mais importante do dia (mandar o pedido) acabava em silêncio. Erro não
 * passa por aqui — erro fica junto do campo ou do botão, onde dá para agir.
 *
 * `avisar()` pode ser chamado de qualquer componente do cliente; o `Toaster`
 * montado no layout é quem desenha. A região é `role="status"`, então o leitor
 * de tela anuncia sem roubar o foco.
 */

type Aviso = { id: number; texto: string };

let avisos: Aviso[] = [];
let proximo = 0;
const ouvintes = new Set<() => void>();

function mudar(lista: Aviso[]) {
  avisos = lista;
  ouvintes.forEach((ouvir) => ouvir());
}

export function avisar(texto: string) {
  const id = ++proximo;
  mudar([...avisos, { id, texto }].slice(-3));
  window.setTimeout(() => mudar(avisos.filter((a) => a.id !== id)), 4000);
}

const vazio: Aviso[] = [];

export function Toaster() {
  const lista = React.useSyncExternalStore(
    (ouvir) => {
      ouvintes.add(ouvir);
      return () => ouvintes.delete(ouvir);
    },
    () => avisos,
    () => vazio,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {lista.map((aviso) => (
        <div
          key={aviso.id}
          className="bg-fg text-background animate-ds-in flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-(--shadow-md)"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {aviso.texto}
        </div>
      ))}
    </div>
  );
}
