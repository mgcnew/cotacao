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
        <td data-label="Fornecedor"><strong>${escapeHtml(supplier.name)}</strong></td>
        <td data-label="Ganhos">${supplier.wins}</td>
        <td data-label="Perdidos">${supplier.losses}</td>
        <td data-label="Não respondeu">${supplier.noResponses}</td>
        <td data-label="Não fornece">${supplier.unavailable}</td>
        <td data-label="Valor estimado" class="money">${escapeHtml(MONEY.format(supplier.awardedValue))}${supplier.uncalculatedWins > 0 ? `<small>${supplier.uncalculatedWins} sem conversão</small>` : ""}</td>
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
              <table class="report-table"><thead><tr><th>Fornecedor</th><th>Proposta final</th><th>Resultado</th><th>Quantidade</th><th>Economia negociada</th></tr></thead>
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
                    <td data-label="Fornecedor">${escapeHtml(offer.supplierName)}</td>
                    <td data-label="Proposta final">${price === null ? "—" : `${escapeHtml(MONEY.format(price))} / ${escapeHtml(item.pricingUnit)}`}${offer.quotedPrice !== null && offer.quotedPrice !== price ? `<small>original ${escapeHtml(MONEY.format(offer.quotedPrice))}</small>` : ""}</td>
                    <td data-label="Resultado">${result}</td>
                    <td data-label="Quantidade">${offer.outcome === "won" ? `${escapeHtml(QTY.format(offer.wonQuantity))} ${escapeHtml(item.purchaseUnit)}${offer.estimatedPricingQuantity === null ? "<small>sem conversão para o total</small>" : `<small>estimativa ${escapeHtml(QTY.format(offer.estimatedPricingQuantity))} ${escapeHtml(item.pricingUnit)}</small>`}` : "—"}</td>
                    <td data-label="Economia negociada">${offer.negotiatedSavings === null ? "—" : escapeHtml(MONEY.format(offer.negotiatedSavings))}</td>
                  </tr>`;
                })
                .join("")}</tbody></table>
            </article>`,
          )
          .join("")}
      </section>`,
    )
    .join("");
  const realization = report.realization;
  const realizationRows = realization?.items
    .map((item) => {
      const status =
        item.receiptStatus === "received"
          ? "Recebido"
          : item.receiptStatus === "partial"
            ? "Parcial"
            : "Pendente";
      return `<tr>
        <td data-label="Produto"><strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.supplierName)} · pedido #${item.orderNumber}</small></td>
        <td data-label="Situação">${status}</td>
        <td data-label="Pedido">${escapeHtml(QTY.format(item.requestedQuantity))} ${escapeHtml(item.purchaseUnit)}</td>
        <td data-label="Recebido">${item.receiptStatus === "pending" ? "—" : `${escapeHtml(QTY.format(item.receivedQuantity))} ${escapeHtml(item.purchaseUnit)}<small>${escapeHtml(QTY.format(item.receivedPricingQuantity))} ${escapeHtml(item.pricingUnit)}</small>`}</td>
        <td data-label="Preço combinado" class="money">${escapeHtml(MONEY.format(item.agreedPrice))}/${escapeHtml(item.pricingUnit)}${item.quotedPrice === null ? "" : `<small>inicial ${escapeHtml(MONEY.format(item.quotedPrice))}</small>`}</td>
        <td data-label="Preço da nota" class="money">${item.practicedPrice === null ? "—" : `${escapeHtml(MONEY.format(item.practicedPrice))}/${escapeHtml(item.pricingUnit)}`}</td>
        <td data-label="Economia realizada" class="money">${item.realizedSavings === null ? "—" : `${escapeHtml(MONEY.format(item.realizedSavings))}<small>negociada ${escapeHtml(MONEY.format(item.negotiatedSavingsOnReceived ?? 0))} · divergência ${escapeHtml(MONEY.format(item.divergenceImpact ?? 0))}</small>`}</td>
      </tr>`;
    })
    .join("");
  const realizationSection = realization
    ? `<section class="realization">
      <h2>Resultado após conferência</h2>
      <p>Quantidades e preços efetivamente confirmados no recebimento.</p>
      <p class="position"><strong>${realization.summary.pendingItemCount === 0 && realization.summary.partiallyReceivedItemCount === 0 && realization.summary.orderedItemCount > 0 ? "Conferência concluída" : realization.summary.receivedItemCount > 0 ? "Resultado parcial" : "Aguardando conferência"}</strong> · ${realization.summary.fullyReceivedItemCount} recebidos · ${realization.summary.partiallyReceivedItemCount} parciais · ${realization.summary.pendingItemCount} pendentes</p>
      ${realization.summary.postedReceiptCount > 0 ? `<div class="realization-metrics">
        ${metric("Economia negociada no recebido", MONEY.format(realization.summary.negotiatedSavingsOnReceived), "inicial x combinado, quantidade real")}
        ${metric("Economia realizada", MONEY.format(realization.summary.realizedSavings), "inicial x nota, quantidade real")}
        ${metric("Divergência nota x pedido", MONEY.format(realization.summary.divergenceImpact), "positivo indica valor pago a mais")}
        ${metric("Valor já conferido", MONEY.format(realization.summary.actualCost), `${realization.summary.postedReceiptCount} conferências`)}
      </div><p class="result-note">A economia realizada já incorpora a divergência da nota e substitui a estimativa na parte recebida. Estes valores não são somados entre si.</p>${realization.summary.calculableReceivedItemCount < realization.summary.receivedItemCount ? `<p class="notice">${realization.summary.receivedItemCount - realization.summary.calculableReceivedItemCount} itens recebidos não possuem preço inicial suficiente para medir economia e ficaram fora dos totais.</p>` : ""}${realization.lastReceiptAt ? `<p class="updated">Recebimentos considerados até ${escapeHtml(DATE_TIME.format(new Date(realization.lastReceiptAt)))}.</p>` : ""}` : '<p class="notice">Ainda não há recebimento confirmado. A economia disponível acima continua sendo a posição conhecida na conclusão.</p>'}
    </section>${realization.items.length > 0 ? `<h2 class="section-title">Conferência por produto</h2><table class="report-table"><thead><tr><th>Produto</th><th>Situação</th><th>Pedido</th><th>Recebido</th><th class="money">Combinado</th><th class="money">Nota</th><th class="money">Economia realizada</th></tr></thead><tbody>${realizationRows}</tbody></table>` : ""}`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório - ${escapeHtml(report.round.title)}</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#17202a;background:#fff;font-size:14px}*{box-sizing:border-box}body{margin:0;padding:32px}main{max-width:1180px;margin:auto;min-width:0}h1,h2,h3,p{margin:0;overflow-wrap:anywhere}header.top{border-bottom:2px solid #e2e5e9;padding-bottom:18px;margin-bottom:20px}.company{color:#59636e;margin-bottom:4px}.subtitle{color:#59636e;margin-top:5px}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:18px 0}.metric{border:1px solid #dfe3e8;border-radius:10px;padding:12px;min-width:0}.metric span,.metric small,td small{display:block;color:#69737d;font-size:11px}.metric strong{display:block;font-size:19px;margin:5px 0;overflow-wrap:anywhere}.notice{border:1px solid #e4b658;background:#fff9e8;border-radius:10px;padding:11px;margin:15px 0}.section-title{margin:25px 0 9px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border:1px solid #dfe3e8;padding:8px;vertical-align:top;overflow-wrap:anywhere}th{background:#f3f5f7}.money{text-align:right}.group{margin-top:22px;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden}.group>h2{padding:12px 14px;background:#f3f5f7;font-size:15px}.group>h2 small{font-weight:normal;color:#69737d}.item{padding:14px;border-top:1px solid #dfe3e8;break-inside:avoid}.item:first-of-type{border-top:0}.item header{margin-bottom:9px}.item header p{color:#69737d;font-size:12px;margin-top:2px}.winner td{background:#effaf3}.footer{border-top:1px solid #dfe3e8;color:#69737d;font-size:11px;margin-top:24px;padding-top:12px}@media screen and (max-width:720px){body{padding:14px}h1{font-size:22px;line-height:1.15}header.top{padding-bottom:14px;margin-bottom:16px}.subtitle{line-height:1.45}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}.metric{padding:10px}.metric strong{font-size:16px;line-height:1.2}.notice{line-height:1.45}.section-title{font-size:17px;margin:22px 0 8px}.report-table,.report-table tbody,.report-table tr,.report-table td{display:block;width:100%}.report-table thead{display:none}.report-table tbody{display:grid;gap:8px}.report-table tr{overflow:hidden;border:1px solid #dfe3e8;border-radius:10px;background:#fff}.report-table td{display:grid;grid-template-columns:minmax(7.25rem,40%) minmax(0,1fr);gap:8px;border:0;border-bottom:1px solid #edf0f2;padding:8px 10px;line-height:1.35}.report-table td:last-child{border-bottom:0}.report-table td::before{content:attr(data-label);color:#69737d;font-size:11px;font-weight:600}.report-table .money{text-align:left}.report-table .winner td{background:#effaf3}.group{margin-top:16px}.group>h2{padding:10px 12px}.item{padding:11px}.item header{margin-bottom:8px}.footer{line-height:1.45;margin-top:18px}}
.realization{border:1px solid #dfe3e8;border-radius:12px;margin-top:20px;padding:15px;break-inside:avoid}.realization>p{color:#59636e;margin-top:5px}.realization .position{margin-top:12px}.realization-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.result-note{background:#eef6ff;border-radius:8px;color:#25364a!important;padding:9px 11px}.updated{font-size:11px}@media screen and (max-width:720px){.realization-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{body{padding:0}.metrics{grid-template-columns:repeat(5,1fr)}.realization-metrics{grid-template-columns:repeat(4,1fr)}.group{break-inside:auto}.item{break-inside:avoid}thead{display:table-header-group}}
</style></head><body><main>
<header class="top"><p class="company">${escapeHtml(report.companyName)}</p><h1>${escapeHtml(report.round.title)}</h1><p class="subtitle">Relatório ${report.round.status === "completed" ? "de conclusão" : "prévio"} da cotação · início ${report.round.startedAt ? escapeHtml(DATE_TIME.format(new Date(report.round.startedAt))) : "não registrado"} · conclusão ${report.round.completedAt ? escapeHtml(DATE_TIME.format(new Date(report.round.completedAt))) : "em andamento"}</p>${report.round.notes ? `<p class="subtitle"><strong>Observações:</strong> ${escapeHtml(report.round.notes)}</p>` : ""}</header>
<section class="metrics">
${metric("Itens cotados", String(report.summary.itemCount), `${report.summary.purchasedItemCount} com compra`)}
${metric("Fornecedores vencedores", String(report.summary.winnerCount), `${report.summary.supplierCount} participantes`)}
${metric("Valor adjudicado estimado", MONEY.format(report.summary.estimatedAwardedValue), `${coverage} itens calculáveis`)}
${metric("Economia negociada", MONEY.format(report.summary.negotiatedSavings), "original x adjudicado")}
${metric("Escolha de embalagens", MONEY.format(report.summary.packagingChoiceResult), "custo unitário x alternativa")}
</section>
${report.summary.calculablePurchasedItems < report.summary.purchasedItemCount ? `<p class="notice">Os totais abrangem ${coverage} itens comprados. Itens sem conversão confiável foram excluídos, não considerados como economia zero.</p>` : ""}
${realizationSection}
<h2 class="section-title">Resultado por fornecedor</h2><table class="report-table"><thead><tr><th>Fornecedor</th><th>Ganhos</th><th>Perdidos</th><th>Não respondeu</th><th>Não fornece</th><th class="money">Valor estimado</th></tr></thead><tbody>${supplierRows}</tbody></table>
<h2 class="section-title">Produtos cotados</h2>${groupSections}
<p class="footer">Posição da conclusão gerada em ${escapeHtml(DATE_TIME.format(new Date(report.generatedAt)))}. A escolha de embalagens é uma métrica separada e exclusiva de produtos com essa finalidade.${realization ? ` Posição dos recebimentos consultada em ${escapeHtml(DATE_TIME.format(new Date(realization.calculatedAt)))}.` : ""}</p>
</main></body></html>`;
}
