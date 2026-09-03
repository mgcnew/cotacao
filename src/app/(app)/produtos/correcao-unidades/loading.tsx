import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

export default function CorrecaoUnidadesLoading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
