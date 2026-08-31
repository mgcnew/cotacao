import { ProdutoContent } from "@/app/(app)/produtos/[id]/page";

export default async function ProdutoEmModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ProdutoContent id={id} query={query} emModal />;
}
