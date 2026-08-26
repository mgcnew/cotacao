"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintReportButton() {
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
      <Printer className="size-3.5" aria-hidden /> Imprimir ou salvar PDF
    </Button>
  );
}
