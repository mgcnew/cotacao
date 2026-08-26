import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: Props) {
  return (
    // Empilha no celular: título e ações lado a lado espremeriam os dois.
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-fg text-xl font-semibold tracking-tight">
          {title}
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
