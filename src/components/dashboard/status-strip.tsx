import Link from "next/link";

export type StatusItem = {
  label: string;
  value: string;
  /** Contexto curto ao lado do número, quando ajuda. */
  detail?: string;
  href: string;
};

/**
 * O que está em curso, numa linha — sem cartão.
 *
 * São só os números que NÃO viram tarefa na lista de prioridades: quantas
 * cotações estão abertas, quantos pedidos esperam mercadoria, quantos
 * fornecedores já responderam. "Pedidos atrasados" e "fornecedores sem
 * responder" ficam de fora de propósito: são pendências, e pendência mora na
 * lista, com o verbo para resolvê-la, e não num cartão ao lado.
 */
export function StatusStrip({ items }: { items: StatusItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Situação da operação"
      className="mb-5 flex flex-wrap items-baseline gap-x-8 gap-y-2"
    >
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="hover:text-primary focus-visible:ring-ring/40 flex min-h-8 items-baseline gap-2 rounded-md text-sm outline-none focus-visible:ring-3"
        >
          <span className="text-fg-muted">{item.label}</span>
          <strong className="text-fg text-base tabular-nums">
            {item.value}
          </strong>
          {item.detail ? (
            <span className="text-fg-subtle text-xs">{item.detail}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
