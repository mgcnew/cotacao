import { notFound } from "next/navigation";

import { CountWorkspace } from "@/components/stock-counts/count-workspace";
import { stockCountPublicUrl } from "@/features/stock-counts/public";
import {
  getStockCount,
  listCountProducts,
  listCountUnits,
  listLastCountUnits,
} from "@/features/stock-counts/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Símbolos que querem dizer "unidade": o padrão de quem ainda não escolheu. */
const UNIDADE = new Set(["un", "und", "unid", "unidade", "u"]);

export default async function ContagemPage({
  params,
}: PageProps<"/contagens/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const company = await requireActiveCompany();
  // O catálogo é a consulta pesada; vai como promessa e só a busca espera.
  const products = listCountProducts(company.companyId);
  const [count, permissions, units, lastUnits] = await Promise.all([
    getStockCount(company.companyId, id),
    getPermissions(company.companyId),
    listCountUnits(company.companyId),
    listLastCountUnits(company.companyId),
  ]);
  if (!count) notFound();

  const canManage =
    permissions.has("product.update") ||
    permissions.has("purchase_round.create") ||
    permissions.has("order.create");
  const created = new Date(count.createdAt);
  const dia = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: company.companyTimezone,
  }).format(created);
  const defaultUnitId =
    units.find((unit) => UNIDADE.has(unit.symbol.trim().toLowerCase()))?.id ??
    null;

  return (
    <CountWorkspace
      // Finalizar e reabrir refazem a página: a chave faz a tela recomeçar do
      // que o servidor tem, em vez de manter o estado de antes.
      key={count.status}
      count={{
        id: count.id,
        name: count.name,
        title: count.name ?? `Contagem de ${dia}`,
        dateLabel: dia,
        author: count.author,
        status: count.status,
        publicUrl: stockCountPublicUrl(count.publicToken),
      }}
      initialItems={count.items}
      products={products}
      units={units}
      lastUnits={lastUnits}
      defaultUnitId={defaultUnitId}
      canManage={canManage}
    />
  );
}
