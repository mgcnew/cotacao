import { Suspense } from "react";

import { RouteModal } from "@/components/layout/route-modal";
import { SupplierTabs } from "@/components/suppliers/supplier-tabs";
import { SupplierStatusToggle } from "@/components/suppliers/supplier-status-toggle";
import { Badge } from "@/components/ui/badge";
import { carregarFornecedor } from "@/features/suppliers/central";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

/**
 * A casca do modal do fornecedor — num layout, e não nos `page.tsx`, de propósito.
 *
 * O fornecedor tem cinco áreas: cadastro, contatos, modelo de compra, avisos e
 * histórico comercial. Se o `<RouteModal>` estivesse dentro delas, trocar de
 * aba desmontaria um diálogo e montaria outro: a animação tocaria de novo, o
 * foco voltaria ao começo e a caixa piscaria só para trocar o miolo. No layout
 * ele persiste, e o que troca é apenas o `children` — cada aba com a sua
 * fronteira de espera.
 *
 * `xl` porque o histórico é uma tabela larga, com uma coluna por rodada.
 */
export default async function LayoutDoModalDoFornecedor({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;

  return (
    <RouteModal
      size="xl"
      // As abas têm alturas muito diferentes — contatos é uma tabela curta, o
      // histórico é longo. Sem altura fixa a caixa pula de tamanho a cada
      // troca, e o pulo desfaz a ilusão de continuar no mesmo lugar.
      alturaEstavel
      titulo={
        <Suspense
          fallback={
            <span className="bg-surface-muted block h-5 w-48 animate-pulse rounded" />
          }
        >
          <Titulo id={id} />
        </Suspense>
      }
      descricao={
        <Suspense
          fallback={
            <span className="bg-surface-muted mt-1 block h-4 w-64 animate-pulse rounded" />
          }
        >
          <Descricao id={id} />
        </Suspense>
      }
      acao={
        <Suspense fallback={<div className="h-7 w-20" />}>
          <AcaoDoCabecalho id={id} />
        </Suspense>
      }
    >
      <SupplierTabs supplierId={id} />
      {children}
    </RouteModal>
  );
}

/** Uma leitura só — `carregarFornecedor` é memoizada e o corpo reaproveita. */
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

async function AcaoDoCabecalho({ id }: { id: string }) {
  const company = await requireActiveCompany();
  const [supplier, permissions] = await Promise.all([
    carregarFornecedor(id),
    getPermissions(company.companyId),
  ]);
  if (!supplier) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant={supplier.status === "active" ? "default" : "secondary"}>
        {STATUS_LABEL[supplier.status] ?? supplier.status}
      </Badge>
      {permissions.has("supplier.update") ? (
        <SupplierStatusToggle
          supplierId={supplier.id}
          status={supplier.status}
        />
      ) : null}
    </div>
  );
}
