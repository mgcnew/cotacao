import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Aviso honesto de que o módulo ainda não foi construído nesta fase. */
  phase?: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  phase,
  action,
}: Props) {
  return (
    <div className="border-border bg-surface flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="bg-surface-muted text-fg-subtle grid size-10 place-items-center rounded-lg">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-fg text-sm font-medium">{title}</p>
        <p className="text-fg-muted text-sm">{description}</p>
      </div>
      {phase ? (
        <span className="bg-surface-muted text-fg-subtle rounded-sm px-2 py-1 text-xs">
          {phase}
        </span>
      ) : null}
      {action}
    </div>
  );
}
