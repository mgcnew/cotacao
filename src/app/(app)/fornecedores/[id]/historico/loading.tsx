import {
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Esqueleto do histórico comercial. Cabeçalho e abas vêm do `layout.tsx`. */
export default function Loading() {
  return (
    <>
      <MetricsSkeleton count={5} />
      <TableSkeleton rows={7} columns={6} />
    </>
  );
}
