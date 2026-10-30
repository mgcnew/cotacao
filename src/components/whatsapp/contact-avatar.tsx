import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = [
  "bg-primary-soft text-primary",
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-surface-muted text-fg-muted",
] as const;

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

function initials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !SMALL_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return "";
  const letters = (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]);
  return /\p{L}/u.test(letters) ? letters.toLocaleUpperCase("pt-BR") : "";
}

/** O mesmo fornecedor tem sempre a mesma cor, em qualquer lista. */
function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/**
 * Iniciais sobre um tom suave. Número que ainda não é de um fornecedor
 * cadastrado ganha o contorno tracejado: a diferença se vê na lista sem ler.
 */
export function ContactAvatar({
  name,
  linked,
  className,
}: {
  name: string;
  linked: boolean;
  className?: string;
}) {
  const text = linked ? initials(name) : "";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold select-none",
        linked && text
          ? toneFor(name)
          : "text-fg-subtle border-border-strong border border-dashed",
        className,
      )}
    >
      {text || <UserRound className="size-4" />}
    </span>
  );
}
