"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PAGE_SIZE_OPTIONS } from "@/lib/list-pagination";
import { cn } from "@/lib/utils";

function pagesAround(current: number, total: number) {
  const candidates = [1, current - 1, current, current + 1, total];
  return [...new Set(candidates.filter((page) => page >= 1 && page <= total))].sort(
    (a, b) => a - b,
  );
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  allowPageSize = true,
}: {
  page: number;
  pageSize: number;
  total: number;
  allowPageSize?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const currentParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams(currentParams.toString());
    if (target <= 1) params.delete("pagina");
    else params.set("pagina", String(target));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const changeSize = (value: string) => {
    const params = new URLSearchParams(currentParams.toString());
    params.set("por_pagina", value);
    params.delete("pagina");
    router.push(`${pathname}?${params.toString()}`);
  };

  const visiblePages = pagesAround(page, totalPages);

  return (
    <footer className="border-border bg-surface-sunken flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-fg-muted flex flex-wrap items-center gap-3 text-xs">
        <span className="tabular-nums">
          {start}–{end} de {total}
        </span>
        {allowPageSize ? (
          <label className="flex items-center gap-1.5">
            <span>Por página</span>
            <select
              value={pageSize}
              onChange={(event) => changeSize(event.target.value)}
              className="border-input bg-background text-fg h-7 rounded-md border px-2 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              aria-label="Registros por página"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <nav className="flex items-center gap-1" aria-label="Paginação da tabela">
        <Button
          asChild={page > 1}
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          {page > 1 ? (
            <Link href={hrefForPage(page - 1)} scroll={false}>
              <ChevronLeft aria-hidden />
            </Link>
          ) : (
            <ChevronLeft aria-hidden />
          )}
        </Button>

        {visiblePages.map((number, index) => {
          const previous = visiblePages[index - 1];
          return (
            <span key={number} className="contents">
              {previous && number - previous > 1 ? (
                <span className="text-fg-subtle px-1 text-xs" aria-hidden>
                  …
                </span>
              ) : null}
              <Link
                href={hrefForPage(number)}
                scroll={false}
                aria-current={number === page ? "page" : undefined}
                className={cn(
                  "grid size-7 place-items-center rounded-md text-xs font-medium transition-colors",
                  number === page
                    ? "bg-primary text-primary-fg"
                    : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                )}
              >
                {number}
              </Link>
            </span>
          );
        })}

        <Button
          asChild={page < totalPages}
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={page >= totalPages}
          aria-label="Próxima página"
        >
          {page < totalPages ? (
            <Link href={hrefForPage(page + 1)} scroll={false}>
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <ChevronRight aria-hidden />
          )}
        </Button>
      </nav>
    </footer>
  );
}
