import { TableSkeleton } from "@/components/layout/page-skeleton";

/** Esqueleto da comparação: a matriz de produtos por fornecedor. */
export default function Loading() {
  return <TableSkeleton rows={8} columns={6} />;
}
