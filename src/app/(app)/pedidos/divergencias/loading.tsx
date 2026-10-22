import {
  CardSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca das divergências: cabeçalho, os números e as pendências. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <MetricsSkeleton
        count={3}
        className="mb-4 grid-cols-3 gap-2 sm:mb-6 sm:gap-3"
      />
      <div className="flex flex-col gap-3">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}
