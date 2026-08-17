import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do fornecedor: dados cadastrais e os contatos. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <div className="mb-6">
        <CardSkeleton lines={4} />
      </div>
      <section>
        <SectionTitleSkeleton lines={2} />
        <CardSkeleton lines={3} />
      </section>
    </PageSkeleton>
  );
}
