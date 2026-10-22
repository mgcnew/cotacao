import Link from "next/link";
import { Suspense } from "react";

import { SupplierStatusToggle } from "@/components/suppliers/supplier-status-toggle";
import { SupplierTabs } from "@/components/suppliers/supplier-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { carregarFornecedor } from "@/features/suppliers/central";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

/**
 * A casca do fornecedor: cabeçalho e abas que ficam, miolo que troca.
 *
 * O fornecedor tem cinco áreas — cadastro, contatos, modelo de compra, avisos
 * e histórico comercial. O cabeçalho fala do FORNECEDOR, não da aba, e por isso
 * mora num layout: trocar de aba troca só o `children`, sem o título piscar nem
 * a faixa de abas remontar. Cada aba tem a sua fronteira de espera.
 * `carregarFornecedor` é memoizada, então cabeçalho e corpo dividem uma leitura.
 */
export default async function LayoutDoFornecedor({
  params,
  children,
}: LayoutProps<"/fornecedores/[id]">) {
  const { id } = await params;

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-fg text-xl font-semibold tracking-tight">
            <Suspense
              fallback={
                <span className="bg-surface-muted block h-6 w-48 animate-pulse rounded" />
              }
            >
              <Titulo id={id} />
            </Suspense>
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            <Suspense
              fallback={
                <span className="bg-surface-muted block h-4 w-64 animate-pulse rounded" />
              }
            >
              <Descricao id={id} />
            </Suspense>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button asChild size="sm" variant="ghost">
            <Link href="/fornecedores">Voltar</Link>
          </Button>
          <Suspense fallback={<div className="h-7 w-20" />}>
            <AcoesDoCabecalho id={id} />
          </Suspense>
        </div>
      </header>

      <div className="border-border -mx-4 mb-6 border-b sm:mx-0">
        <Suspense fallback={<div className="h-11" />}>
          <SupplierTabs supplierId={id} />
        </Suspense>
      </div>

      {children}
    </div>
  );
}

async function Titulo({ id }: { id: string }) {
  const supplier = await carregarFornecedor(id);
  return <>{supplier?.name ?? "Fornecedor"}</>;
}

async function Descricao({ id }: { id: string }) {
  const supplier = await carregarFornecedor(id);
  if (!supplier) return <>Este fornecedor não existe mais.</>;
  return (
    <>
      {supplier.legal_name ??
        "Contatos, categorias atendidas e situação do fornecedor."}
    </>
  );
}

async function AcoesDoCabecalho({ id }: { id: string }) {
  const company = await requireActiveCompany();
  const [supplier, permissions] = await Promise.all([
    carregarFornecedor(id),
    getPermissions(company.companyId),
  ]);
  if (!supplier) return null;

  return (
    <>
      <Badge variant={supplier.status === "active" ? "default" : "secondary"}>
        {STATUS_LABEL[supplier.status] ?? supplier.status}
      </Badge>
      {permissions.has("supplier.update") ? (
        <SupplierStatusToggle
          supplierId={supplier.id}
          status={supplier.status}
        />
      ) : null}
    </>
  );
}
