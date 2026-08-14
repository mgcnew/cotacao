import { ShoppingCart } from "lucide-react";
import Link from "next/link";

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
import { listRoundsWithProgress } from "@/features/rounds/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  draft: "Preparação",
  active: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export default async function ComprasPage() {
  const company = await requireActiveCompany();
  const [rounds, permissions] = await Promise.all([
    listRoundsWithProgress(company.companyId),
    getPermissions(company.companyId),
  ]);

  const podeCriar = permissions.has("purchase_round.create");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Compras"
        description="Rodadas de compra, cotações e pedidos."
        action={
          podeCriar ? (
            <Button asChild size="sm">
              <Link href="/compras/nova">Nova rodada</Link>
            </Button>
          ) : null
        }
      />

      {rounds.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma rodada de compra ainda"
          description="A Rodada é o contêiner de um ciclo: agrupa produtos, convida fornecedores, recebe respostas e vira pedido. O fluxo de criação entra na fase de Rodadas."
          phase="Fase 6 · Rodada — preparação"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rodada</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Produtos</TableHead>
              <TableHead className="text-right">Fornecedores</TableHead>
              <TableHead className="text-right">Responderam</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rounds.map((round) => (
              <TableRow key={round.purchase_round_id}>
                <TableCell>
                  <Link
                    href={`/compras/${round.purchase_round_id}`}
                    className="text-fg hover:text-primary font-medium"
                  >
                    {round.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {STATUS_LABEL[round.status ?? ""] ?? round.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {round.total_items}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {round.total_suppliers}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {round.suppliers_completed}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {round.orders_created}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
