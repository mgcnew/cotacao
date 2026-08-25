import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";

import { ProductImportUploadForm } from "@/components/products/import-upload-form";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProductImportBatches } from "@/features/products/import-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS: Record<string, string> = {
  draft: "Em preparação",
  completed: "Concluída",
  cancelled: "Interrompida",
};

export default async function ProductImportsPage() {
  const company = await requireActiveCompany();
  const [batches, permissions] = await Promise.all([
    listProductImportBatches(company.companyId),
    getPermissions(company.companyId),
  ]);
  const canCreate = permissions.has("product.create");
  return (
    <div className="w-full">
      <PageHeader
        title="Importação de produtos"
        description="Envie a lista inteira e conclua os produtos aos poucos, sem poluir o catálogo."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/produtos">Voltar aos produtos</Link>
          </Button>
        }
      />
      {canCreate ? <ProductImportUploadForm /> : null}
      <div className="mt-6">
        {batches.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="Nenhuma importação"
            description="Sua primeira planilha ficará salva como rascunho para revisão."
          />
        ) : (
          <div className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Linhas</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <span className="font-medium">{batch.file_name}</span>
                      <span className="text-fg-muted block text-xs">
                        {batch.sheet_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      {batch.total_rows.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          batch.status === "completed"
                            ? "default"
                            : batch.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {STATUS[batch.status] ?? batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(batch.created_at))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/produtos/importacoes/${batch.id}`}>
                          Abrir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
