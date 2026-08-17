import {
  FormSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do cadastro de fornecedor. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-3xl">
      <PageHeaderSkeleton action={false} />
      <FormSkeleton fields={5} />
    </PageSkeleton>
  );
}
