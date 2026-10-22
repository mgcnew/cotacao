import { TableSkeleton } from "@/components/layout/page-skeleton";

/** Esqueleto da decisão de compra: item a item, com o preço de cada fornecedor. */
export default function Loading() {
  return <TableSkeleton rows={6} columns={5} />;
}
