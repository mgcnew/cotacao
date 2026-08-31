import Link from "next/link";

import { cn } from "@/lib/utils";

export function CotaProMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="CotaPro"
      className={cn("text-brand shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M20.6 9.9a7.6 7.6 0 1 0 0 12.2"
        fill="none"
        stroke="white"
        strokeWidth="3.1"
        strokeLinecap="round"
      />
      <path
        d="m19.2 16.1 2.15 2.15 4.1-4.65"
        fill="none"
        stroke="white"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CotaProLogo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("flex w-fit items-center gap-2.5", className)}
      aria-label="CotaPro — página inicial"
    >
      <CotaProMark className="size-8 shadow-xs" />
      <span className="text-fg font-semibold tracking-[-0.025em]">
        Cota<span className="text-brand">Pro</span>
        {!compact ? (
          <span className="text-fg-subtle ml-2 text-xs font-normal tracking-normal">
            compras inteligentes
          </span>
        ) : null}
      </span>
    </Link>
  );
}
