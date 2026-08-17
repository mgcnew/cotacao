import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CorrectionForm } from "@/components/quotations/correction-form";
import { NegotiationForm } from "@/components/quotations/negotiation-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRoundComparison } from "@/features/quotations/comparison";
import { getRound } from "@/features/rounds/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const MONEY = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
// O preço normalizado costuma ter casas pequenas: R$ 0,0980 por unidade.
const NORMALIZED = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export default async function ComparacaoPage({
  params,
}: PageProps<"/compras/[id]/comparacao">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [round, comparison, permissions] = await Promise.all([
    getRound(company.companyId, id),
    getRoundComparison(company.companyId, id),
    getPermissions(company.companyId),
  ]);

  if (!round) notFound();

  const podeNegociar = permissions.has("negotiation.create");
  const podeCorrigir = permissions.has("quotation_response.correct");
  const { rows, suppliers } = comparison;

  return (
    <div className="w-full">
      <PageHeader
        title="Comparação de respostas"
        description={`${round.title} · ${suppliers.length} fornecedores · ${rows.length} itens`}
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href={`/compras/${id}`}>Voltar à rodada</Link>
          </Button>
        }
      />

      {rows.length === 0 || suppliers.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nada para comparar ainda"
          description="A comparação aparece quando a rodada tem itens e fornecedores convidados."
        />
      ) : (
        <>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="text-fg-muted sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-medium">
                    Item
                  </th>
                  {suppliers.map((s) => (
                    <th
                      key={s.id}
                      className="text-fg-muted min-w-40 px-3 py-2 text-left font-medium"
                    >
                      {s.suppliers.name}
                      {s.completed_at ? null : (
                        <span className="text-fg-subtle block text-xs font-normal">
                          não concluiu
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.itemId} className="border-border border-t">
                    <td className="bg-surface sticky left-0 z-10 px-3 py-2 align-top">
                      <span className="text-fg font-medium">
                        {row.productName}
                      </span>
                      <span className="text-fg-subtle block text-xs">
                        {row.groupName} ·{" "}
                        {QTY.format(row.requestedQuantity)} {row.purchaseUnit} ·
                        preço por {row.pricingUnit}
                      </span>
                    </td>

                    {suppliers.map((s) => {
                      const cell = row.cells.get(s.id);

                      if (!cell) {
                        return (
                          <td
                            key={s.id}
                            className="text-fg-subtle px-3 py-2 align-top text-xs"
                          >
                            não recebeu
                          </td>
                        );
                      }

                      if (cell.doesNotSupply) {
                        return (
                          <td key={s.id} className="px-3 py-2 align-top">
                            <span className="text-fg-subtle text-xs">
                              não fornece
                            </span>
                            {cell.correctionCount > 0 ? (
                              <Badge
                                variant="outline"
                                className="ml-1 text-[10px]"
                              >
                                corrigido
                              </Badge>
                            ) : null}
                            {cell.notes ? (
                              <span className="text-fg-muted block text-xs">
                                {cell.notes}
                              </span>
                            ) : null}
                            {podeCorrigir && cell.responseItemId ? (
                              <CorrectionForm
                                responseItemId={cell.responseItemId}
                                roundId={id}
                                currentPrice={cell.currentPrice}
                                doesNotSupply
                                supplierName={s.suppliers.name}
                                productName={row.productName}
                                pricingUnit={row.pricingUnit}
                              />
                            ) : null}
                          </td>
                        );
                      }

                      if (cell.currentPrice === null) {
                        return (
                          <td key={s.id} className="px-3 py-2 align-top">
                            <span className="text-fg-subtle text-xs">
                              aguardando
                            </span>
                          </td>
                        );
                      }

                      const melhor =
                        row.bestPrice !== null &&
                        cell.currentPrice === row.bestPrice;

                      return (
                        <td key={s.id} className="px-3 py-2 align-top">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                melhor
                                  ? "text-success font-semibold tabular-nums"
                                  : "text-fg tabular-nums"
                              }
                            >
                              {MONEY.format(cell.currentPrice)}
                            </span>
                            {melhor ? (
                              <Badge variant="secondary" className="text-[10px]">
                                melhor
                              </Badge>
                            ) : null}
                            {cell.correctionCount > 0 ? (
                              <Badge variant="outline" className="text-[10px]">
                                corrigido
                              </Badge>
                            ) : null}
                          </div>

                          {cell.negotiated && cell.quotedPrice !== null ? (
                            <span className="text-fg-subtle block text-xs line-through tabular-nums">
                              {MONEY.format(cell.quotedPrice)}
                            </span>
                          ) : null}

                          {cell.normalizedPrice !== null ? (
                            <span
                              className={
                                row.bestNormalized !== null &&
                                cell.normalizedPrice === row.bestNormalized
                                  ? "text-success block text-xs font-medium tabular-nums"
                                  : "text-fg-muted block text-xs tabular-nums"
                              }
                            >
                              = {NORMALIZED.format(cell.normalizedPrice)} /{" "}
                              {row.comparisonUnit}
                            </span>
                          ) : null}

                          {cell.attributes.length > 0 ? (
                            <span className="text-fg-subtle block text-xs">
                              {cell.attributes
                                .map((a) => `${a.name}: ${a.value}`)
                                .join(" · ")}
                            </span>
                          ) : null}

                          {cell.notes ? (
                            <span className="text-fg-muted block text-xs">
                              {cell.notes}
                            </span>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-1">
                            {podeNegociar && cell.responseItemId ? (
                              <NegotiationForm
                                responseItemId={cell.responseItemId}
                                roundId={id}
                                currentPrice={cell.currentPrice}
                                supplierName={s.suppliers.name}
                                productName={row.productName}
                              />
                            ) : null}
                            {podeCorrigir && cell.responseItemId ? (
                              <CorrectionForm
                                responseItemId={cell.responseItemId}
                                roundId={id}
                                currentPrice={cell.currentPrice}
                                doesNotSupply={false}
                                supplierName={s.suppliers.name}
                                productName={row.productName}
                                pricingUnit={row.pricingUnit}
                              />
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-fg-subtle mt-4 text-xs">
            O preço mostrado é o vigente: quando há negociação registrada, o
            valor original aparece riscado abaixo. Preço riscado não é
            substituído no histórico — cada negociação fica gravada com canal,
            autor e data.
          </p>

          {rows.some((r) => r.conversionName) ? (
            <p className="text-fg-subtle mt-2 text-xs">
              A linha começada por <span className="text-fg-muted">=</span> é o
              preço normalizado, calculado dividindo o preço vigente pelo que o
              fornecedor informou em{" "}
              <span className="text-fg-muted">
                {rows.find((r) => r.conversionName)?.conversionName}
              </span>
              . É por ela que propostas com apresentações diferentes ficam
              comparáveis.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
