import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";

type Props = {
  title: string;
  description?: ReactNode;
  /**
   * Explicação que serve no primeiro dia e vira ruído no trecentésimo: fica
   * atrás de um (i) ao lado do título, em vez de empurrar a lista para baixo
   * todos os dias. `description` continua para o que muda (status, contagem).
   */
  info?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, info, action }: Props) {
  return (
    // Empilha no celular: título e ações lado a lado espremeriam os dois.
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-fg flex items-center gap-1.5 text-xl font-semibold tracking-tight">
          {title}
          {info ? (
            <Tooltip content={info}>
              <button
                type="button"
                aria-label={info}
                className="text-fg-subtle hover:text-fg-muted grid size-6 place-items-center rounded-sm"
              >
                <Info className="size-4" aria-hidden />
              </button>
            </Tooltip>
          ) : null}
        </h1>
        {description ? (
          <p className="text-fg-muted mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {action}
        </div>
      ) : null}
    </header>
  );
}
