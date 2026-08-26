"use client";

import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function RoundModalHeaderAction({ roundId }: { roundId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const showingReport = pathname.endsWith("/relatorio");

  if (showingReport) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => router.back()}
      >
        <ArrowLeft aria-hidden />
        <span className="hidden min-[420px]:inline">Voltar</span>
      </Button>
    );
  }

  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/compras/${roundId}/relatorio`}>
        <FileText aria-hidden />
        <span className="hidden min-[420px]:inline">Relatório</span>
      </Link>
    </Button>
  );
}
