import "server-only";

import type { RoundReport } from "@/features/rounds/report";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function metric(label: string, value: string, detail: string) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

/** Documento autocontido: pode ser salvo, enviado e aberto sem o sistema. */
export function renderRoundReportHtml(report: RoundReport) {
  const coverage = `${report.summary.calculablePurchasedItems}/${report.summary.purchasedItemCount}`;
  const supplierRows = report.suppliers
    .map(
      (supplier) => `<tr>
        <td><strong>${escapeHtml(supplier.name)}</strong></td>
        <td>${supplier.wins}</td><td>${supplier.losses}</td>
        <td>${supplier.noResponses}</td><td>${supplier.unavailable}</td>
        <td class="money">${escapeHtml(MONEY.format(supplier.awardedValue))}${supplier.uncalculatedWins > 0 ? `<small>${supplier.uncalculatedWins} sem conversão</small>` : ""}</td>
      </tr>`,
    )
    .join("");
  const groupSections = report.groups
    .map(
      (group) => `<section class="group">
        <h2>${escapeHtml(group.name)} <small>${group.items.length} itens</small></h2>
        ${group.items
          .map(
            (item) => `<article class="item">
              <header><div><h3>${escapeHtml(item.productName)}</h3><p>${escapeHtml(QTY.format(item.requestedQuantity))} ${escapeHtml(item.purchaseUnit)} · preço por ${escapeHtml(item.pricingUnit)}</p></div></header>
              <table><thead><tr><th>Fornecedor</th><th>Proposta final</th><th>Resultado</th><th>Quantidade</th><th>Economia negociada</th></tr></thead>
              <tbody>${item.offers
                .map((offer) => {
                  const result =
                    offer.outcome === "won"
                      ? "Vencedor"
                      : offer.outcome === "lost"
                        ? "Não selecionado"
                        : offer.outcome === "unavailable"
                          ? "Não fornece"
                          : "Não respondeu";
                  const price =
                    offer.outcome === "won"
                      ? offer.selectedPrice
                      : offer.finalPrice;
                  return `<tr class="${offer.outcome === "won" ? "winner" : ""}">
                    <td>${escapeHtml(offer.supplierName)}</td>
                    <td>${price === null ? "—" : `${escapeHtml(MONEY.format(price))} / ${escapeHtml(item.pricingUnit)}`}${offer.quotedPrice !== null && offer.quotedPrice !== price ? `<small>original ${escapeHtml(MONEY.format(offer.quotedPrice))}</small>` : ""}</td>
                    <td>${result}</td>
                    <td>${offer.outcome === "won" ? `${escapeHtml(QTY.format(offer.wonQuantity))} ${escapeHtml(item.purchaseUnit)}${offer.estimatedPricingQuantity === null ? "<small>sem conversão para o total</small>" : `<small>estimativa ${escapeHtml(QTY.format(offer.estimatedPricingQuantity))} ${escapeHtml(item.pricingUnit)}</small>`}` : "—"}</td>
                    <td>${offer.negotiatedSavings === null ? "—" : escapeHtml(MONEY.format(offer.negotiatedSavings))}</td>
                  </tr>`;
                })
                .join("")}</tbody></table>
            </article>`,
          )
          .join("")}
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório - ${escapeHtml(report.round.title)}</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#17202a;background:#fff;font-size:14px}*{box-sizing:border-box}body{margin:0;padding:32px}main{max-width:1180px;margin:auto}h1,h2,h3,p{margin:0}header.top{border-bottom:2px solid #e2e5e9;padding-bottom:18px;margin-bottom:20px}.company{color:#59636e;margin-bottom:4px}.subtitle{color:#59636e;margin-top:5px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.metric{border:1px solid #dfe3e8;border-radius:10px;padding:12px;min-width:0}.metric span,.metric small,td small{display:block;color:#69737d;font-size:11px}.metric strong{display:block;font-size:19px;margin:5px 0;overflow-wrap:anywhere}.notice{border:1px solid #e4b658;background:#fff9e8;border-radius:10px;padding:11px;margin:15px 0}.section-title{margin:25px 0 9px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border:1px solid #dfe3e8;padding:8px;vertical-align:top}th{background:#f3f5f7}.money{text-align:right}.group{margin-top:22px;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden}.group>h2{padding:12px 14px;background:#f3f5f7;font-size:15px}.group>h2 small{font-weight:normal;color:#69737d}.item{padding:14px;border-top:1px solid #dfe3e8;break-inside:avoid}.item:first-of-type{border-top:0}.item header{margin-bottom:9px}.item header p{color:#69737d;font-size:12px;margin-top:2px}.winner td{background:#effaf3}.footer{border-top:1px solid #dfe3e8;color:#69737d;font-size:11px;margin-top:24px;padding-top:12px}@media(max-width:720px){body{padding:16px}.metrics{grid-template-columns:repeat(2,1fr)}table{display:block;overflow-x:auto;white-space:nowrap}}@media print{body{padding:0}.metrics{grid-template-columns:repeat(4,1fr)}.group{break-inside:auto}.item{break-inside:avoid}thead{display:table-header-group}}
</style></head><body><main>
<header class="top"><p class="company">${escapeHtml(report.companyName)}</p><h1>${escapeHtml(report.round.title)}</h1><p class="subtitle">Relatório ${report.round.status === "completed" ? "de conclusão" : "prévio"} da cotação · início ${report.round.startedAt ? escapeHtml(DATE_TIME.format(new Date(report.round.startedAt))) : "não registrado"} · conclusão ${report.round.completedAt ? escapeHtml(DATE_TIME.format(new Date(report.round.completedAt))) : "em andamento"}</p>${report.round.notes ? `<p class="subtitle"><strong>Observações:</strong> ${escapeHtml(report.round.notes)}</p>` : ""}</header>
<section class="metrics">
${metric("Itens cotados", String(report.summary.itemCount), `${report.summary.purchasedItemCount} com compra`)}
${metric("Fornecedores vencedores", String(report.summary.winnerCount), `${report.summary.supplierCount} participantes`)}
${metric("Valor adjudicado estimado", MONEY.format(report.summary.estimatedAwardedValue), `${coverage} itens calculáveis`)}
${metric("Economia negociada", MONEY.format(report.summary.negotiatedSavings), "original x adjudicado")}
</section>
${report.summary.calculablePurchasedItems < report.summary.purchasedItemCount ? `<p class="notice">Os totais abrangem ${coverage} itens comprados. Itens sem conversão confiável foram excluídos, não considerados como economia zero.</p>` : ""}
<h2 class="section-title">Resultado por fornecedor</h2><table><thead><tr><th>Fornecedor</th><th>Ganhos</th><th>Perdidos</th><th>Não respondeu</th><th>Não fornece</th><th class="money">Valor estimado</th></tr></thead><tbody>${supplierRows}</tbody></table>
<h2 class="section-title">Produtos cotados</h2>${groupSections}
<p class="footer">Gerado em ${escapeHtml(DATE_TIME.format(new Date(report.generatedAt)))}. Economia negociada considera somente propostas vencedoras calculáveis. A economia realizada será apurada no recebimento.</p>
</main></body></html>`;
}
