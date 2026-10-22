import {
  CardSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /anotacoes: cabeçalho, um cartão de destaque e as anotações. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <div className="mb-6">
        <CardSkeleton lines={3} />
      </div>
      <ListSkeleton rows={5} />
    </PageSkeleton>
  );
}
