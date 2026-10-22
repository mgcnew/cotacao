import {
  CardSkeleton,
  FormSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca da conferência: cabeçalho, o documento fiscal e os itens a conferir. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <div className="mb-5">
        <CardSkeleton lines={3} />
      </div>
      <div className="flex flex-col gap-3">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
        <FormSkeleton fields={3} />
      </div>
    </PageSkeleton>
  );
}
