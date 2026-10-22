import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /etiquetas: cabeçalho e os cartões de escolha. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </div>
    </PageSkeleton>
  );
}
