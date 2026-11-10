import {
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /contagens: cabeçalho e a lista de contagens. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <ListSkeleton rows={6} />
    </PageSkeleton>
  );
}
