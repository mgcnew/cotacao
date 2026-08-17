import {
  FormSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * Casca de /compras/nova.
 *
 * Precisa existir mesmo sendo um formulário curto: sem ela, a rota herdaria a
 * casca de /compras, e quem clicou em "Nova rodada" veria por um instante o
 * desenho de uma tabela que não vem.
 */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-3xl">
      <PageHeaderSkeleton action={false} />
      <FormSkeleton fields={3} />
    </PageSkeleton>
  );
}
