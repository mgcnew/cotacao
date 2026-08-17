import {
  FormSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do cadastro de produto. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-3xl">
      <PageHeaderSkeleton action={false} />
      <FormSkeleton fields={6} />
    </PageSkeleton>
  );
}
