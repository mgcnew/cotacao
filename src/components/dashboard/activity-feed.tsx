import Link from "next/link";

import type { ActivityEntry } from "@/features/dashboard/activity";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "há 3 horas" em vez de 16/08 12:04.
 *
 * Para o que acabou de acontecer, a distância diz mais do que o horário: quem
 * lê quer saber se é recente, não a que horas foi. Passando de uma semana a
 * conta se inverte, e a data volta a ser mais útil.
 */
function quandoFoi(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;

  const dias = Math.round(horas / 24);
  if (dias <= 7) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;

  return DATA_HORA.format(new Date(iso));
}

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <ul className="relative flex flex-col before:absolute before:top-5 before:bottom-5 before:left-[1.18rem] before:w-px before:bg-border">
      {entries.map((entry) => {
        const conteudo = (
          <>
            <span className="min-w-0 flex-1">
              <span className="text-fg text-sm">{entry.label}</span>
              {entry.detail ? (
                <span className="text-fg-muted block text-xs">
                  {entry.detail}
                </span>
              ) : null}
            </span>
            <span className="text-fg-subtle shrink-0 text-xs whitespace-nowrap">
              {quandoFoi(entry.occurredAt)}
            </span>
          </>
        );

        return (
          <li key={entry.id} className="relative flex gap-3 px-4 py-3 sm:px-5">
            <span
              className={`relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface ${
                entry.bySupplier ? "bg-primary" : "bg-fg-subtle"
              }`}
              aria-hidden
            />
            {entry.href ? (
              <Link
                href={entry.href}
                className="hover:text-primary flex min-w-0 flex-1 items-baseline gap-3 underline-offset-4 hover:underline"
              >
                {conteudo}
              </Link>
            ) : (
              <span className="flex min-w-0 flex-1 items-baseline gap-3">
                {conteudo}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
