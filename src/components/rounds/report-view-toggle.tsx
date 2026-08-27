import { FileText, ListChecks } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function ReportViewToggle({
  roundId,
  simple,
}: {
  roundId: string;
  simple: boolean;
}) {
  return (
    <div
      className="border-border bg-surface-sunken flex rounded-lg border p-0.5"
      aria-label="Versão do relatório"
    >
      <Button
        asChild
        size="sm"
        variant={simple ? "default" : "ghost"}
        className="h-7 px-2.5 text-xs"
      >
        <Link
          href={`/compras/${roundId}/relatorio?tipo=simples`}
          replace
          aria-current={simple ? "page" : undefined}
        >
          <ListChecks aria-hidden /> Simples
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant={simple ? "ghost" : "default"}
        className="h-7 px-2.5 text-xs"
      >
        <Link
          href={`/compras/${roundId}/relatorio`}
          replace
          aria-current={!simple ? "page" : undefined}
        >
          <FileText aria-hidden /> Completo
        </Link>
      </Button>
    </div>
  );
}
