import {
  FormSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do pedido direto: fornecedor, prazo e os itens. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-3xl">
      <PageHeaderSkeleton action={false} />
      <FormSkeleton fields={4} />
    </PageSkeleton>
  );
}
