import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /configuracoes: cabeçalho, a fila de abas e o painel aberto. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />

      <div
        aria-hidden
        className="bg-surface-muted mb-4 h-9 w-full max-w-md animate-pulse rounded-lg"
      />

      <CardSkeleton lines={5} />
    </PageSkeleton>
  );
}
