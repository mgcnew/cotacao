import "server-only";

import type { RoundReport } from "@/features/rounds/report";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function price(
  label: string,
  value: number | null,
  pricingUnit: string,
  highlight = false,
) {
  return `<div class="price${highlight ? " highlight" : ""}"><span>${escapeHtml(label)}</span><strong>${value === null ? "Não informado" : `${escapeHtml(MONEY.format(value))} / ${escapeHtml(pricingUnit)}`}</strong></div>`;
}

/** Resumo autocontido, com leitura simples em celular, impressão ou arquivo. */
export function renderSimpleRoundReportHtml(report: RoundReport) {
  const hasSavings = report.summary.negotiatedSavings >= 0;
  const groups = report.groups
    .map(
      (group) => `<section class="group">
        <header class="group-title"><h2>${escapeHtml(group.name)}</h2><span>${group.items.length} produtos</span></header>
        ${group.items
          .map((item) => {
            const winners = item.offers.filter(
              (offer) => offer.outcome === "won",
            );
            const otherQuotes = item.offers.filter(
              (offer) => offer.outcome === "lost",
            );
            const noResponses = item.offers.filter(
              (offer) => offer.outcome === "no_response",
            );
            const unavailable = item.offers.filter(
              (offer) => offer.outcome === "unavailable",
            );
            const otherParticipants = [
              ...otherQuotes,
              ...noResponses,
              ...unavailable,
            ];
            const winnerCards = winners.length
              ? `<div class="winners">${winners
                  .map((winner) => {
                    const negotiated =
                      winner.quotedPrice !== null &&
                      winner.selectedPrice !== null &&
                      winner.quotedPrice !== winner.selectedPrice;
                    return `<div class="winner">
                      <p class="winner-label"><b>✓</b> Comprado de</p>
                      <h4>${escapeHtml(winner.supplierName)}</h4>
                      <div class="prices">${negotiated ? `${price("Preço inicial", winner.quotedPrice, item.pricingUnit)}${price("Preço negociado", winner.selectedPrice, item.pricingUnit, true)}` : price("Preço fechado", winner.selectedPrice, item.pricingUnit, true)}</div>
                      <p class="quantity">${escapeHtml(QTY.format(winner.wonQuantity))} ${escapeHtml(item.purchaseUnit)}</p>
                    </div>`;
                  })
                  .join("")}</div>`
              : '<div class="not-bought"><b>⊘</b> Produto não comprado</div>';
            const participantDetails = otherParticipants.length
              ? `<details class="other-participants"><summary>Outros participantes e preços (${otherParticipants.length}) <b>⌄</b></summary><div class="participant-list">${otherParticipants
                  .map((offer) => {
                    const negotiated =
                      offer.outcome === "lost" &&
                      offer.quotedPrice !== null &&
                      offer.finalPrice !== null &&
                      offer.quotedPrice !== offer.finalPrice;
                    const status =
                      offer.outcome === "lost"
                        ? "Cotou"
                        : offer.outcome === "unavailable"
                          ? "Não fornece"
                          : "Não respondeu";
                    const content =
                      offer.outcome === "lost"
                        ? `<div class="prices">${negotiated ? `${price("Inicial", offer.quotedPrice, item.pricingUnit)}${price("Negociado", offer.finalPrice, item.pricingUnit)}` : price("Preço informado", offer.finalPrice, item.pricingUnit)}</div>`
                        : `<p class="empty-price">${offer.outcome === "unavailable" ? "Informou que não trabalha com este produto." : "Nenhum preço foi informado."}</p>`;
                    return `<div class="participant"><header><h4>${escapeHtml(offer.supplierName)}</h4><span>${status}</span></header>${content}</div>`;
                  })
                  .join("")}</div></details>`
              : "";

            return `<article class="product">
              <header class="product-title"><div><h3>${escapeHtml(item.productName)}</h3><p>Pedido: ${escapeHtml(QTY.format(item.requestedQuantity))} ${escapeHtml(item.purchaseUnit)}</p></div><span>${item.offers.length} participantes</span></header>
              ${winnerCards}
              ${participantDetails}
            </article>`;
          })
          .join("")}
      </section>`,
    )
    .join("");
  const incompleteCoverage =
    report.summary.calculablePurchasedItems < report.summary.purchasedItemCount;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resumo da cotação - ${escapeHtml(report.round.title)}</title>
<style>
:root{font-family:Arial,sans-serif;color:#17202a;background:#fff;font-size:15px}*{box-sizing:border-box}body{margin:0;padding:28px}main{max-width:900px;margin:auto}h1,h2,h3,h4,p{margin:0;overflow-wrap:anywhere}.top{border-bottom:2px solid #e2e5e9;padding-bottom:16px}.company{color:#5f6974;font-size:14px}.top h1{font-size:26px;margin-top:4px}.date{color:#5f6974;font-size:13px;margin-top:5px}.economy{background:#ecf9f1;border:2px solid #87d3a5;border-radius:16px;margin-top:18px;padding:22px;text-align:center}.economy.loss{background:#fff0f0;border-color:#e6a1a1}.economy span{color:#137a42;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.economy strong{color:#137a42;display:block;font-size:44px;line-height:1.05;margin-top:8px}.economy.loss span,.economy.loss strong{color:#b4232d}.economy p{color:#53606b;font-size:13px;line-height:1.4;margin:9px auto 0;max-width:560px}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.metric{border:1px solid #dfe3e8;border-radius:11px;padding:12px;text-align:center;min-width:0}.metric span{color:#69737d;display:block;font-size:11px}.metric strong{display:block;font-size:18px;margin-top:5px;overflow-wrap:anywhere}.notice{background:#fff9e8;border:1px solid #e4b658;border-radius:10px;font-size:13px;line-height:1.4;margin-top:12px;padding:10px 12px}.section-heading{font-size:20px;margin:25px 0 10px}.group{border:1px solid #dfe3e8;border-radius:13px;margin-top:14px;overflow:hidden}.group-title{align-items:center;background:#f3f5f7;border-bottom:1px solid #dfe3e8;display:flex;gap:10px;justify-content:space-between;padding:11px 14px}.group-title h2{font-size:16px}.group-title span,.product-title span{color:#69737d;font-size:11px}.product{border-top:1px solid #e5e8eb;padding:15px;break-inside:avoid}.product:first-of-type{border-top:0}.product-title{align-items:start;display:flex;gap:12px;justify-content:space-between}.product-title h3{font-size:17px}.product-title p{color:#59636e;font-size:13px;margin-top:3px}.winners{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px}.winner{background:#ecf9f1;border:1px solid #87d3a5;border-radius:11px;padding:11px}.winner-label{color:#137a42;font-size:11px;font-weight:700;text-transform:uppercase}.winner h4{font-size:16px;margin-top:7px}.quantity{color:#53606b;font-size:13px;margin-top:4px}.prices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.prices>.price:only-child{grid-column:1/-1}.price span{color:#69737d;display:block;font-size:10px}.price strong{display:block;font-size:14px;margin-top:2px;overflow-wrap:anywhere}.price.highlight strong{color:#137a42}.not-bought{align-items:center;background:#f4f5f6;border:1px solid #dfe3e8;border-radius:11px;display:flex;font-size:14px;font-weight:700;gap:7px;margin-top:11px;padding:12px}.other-participants{background:#f8f9fa;border:1px solid #dfe3e8;border-radius:11px;margin-top:10px;overflow:hidden}.other-participants summary{cursor:pointer;font-size:13px;font-weight:700;list-style:none;padding:10px 12px}.other-participants summary::-webkit-details-marker{display:none}.other-participants summary b{float:right}.participant-list{border-top:1px solid #dfe3e8;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:8px}.participant{background:#fff;border:1px solid #dfe3e8;border-radius:9px;padding:9px}.participant header{align-items:start;display:flex;gap:7px;justify-content:space-between}.participant h4{font-size:13px}.participant header span{border:1px solid #dfe3e8;border-radius:999px;color:#59636e;font-size:9px;padding:2px 6px;white-space:nowrap}.empty-price{color:#69737d;font-size:11px;line-height:1.4;margin-top:7px}.footer{border-top:1px solid #dfe3e8;color:#69737d;font-size:11px;line-height:1.4;margin-top:22px;padding-top:11px}@media(max-width:620px){body{padding:12px}.top h1{font-size:22px}.economy{padding:18px 12px}.economy strong{font-size:36px}.metrics{gap:6px}.metric{padding:9px 5px}.metric span{font-size:10px}.metric strong{font-size:14px}.winners,.participant-list{grid-template-columns:1fr}.group-title,.product{padding:11px}.product-title{display:block}.product-title>span{display:block;margin-top:5px}}@media print{body{padding:0}.group{break-inside:auto}.product{break-inside:avoid}.economy,.winner{-webkit-print-color-adjust:exact;print-color-adjust:exact}.other-participants summary{display:none}.other-participants>.participant-list{display:grid!important}}
</style></head><body><main>
<header class="top"><p class="company">${escapeHtml(report.companyName)}</p><h1>${escapeHtml(report.round.title)}</h1><p class="date">${report.round.completedAt ? `Cotação concluída em ${escapeHtml(DATE.format(new Date(report.round.completedAt)))}` : "Cotação ainda em andamento"}</p></header>
<section class="economy${hasSavings ? "" : " loss"}"><span>${hasSavings ? "Economia na negociação" : "Acréscimo na negociação"}</span><strong>${escapeHtml(MONEY.format(Math.abs(report.summary.negotiatedSavings)))}</strong><p>Diferença entre o primeiro preço e o preço fechado com os fornecedores vencedores.</p></section>
${report.summary.packagingChoiceResult !== 0 ? `<p class="notice"><strong>Escolha de embalagens: ${escapeHtml(MONEY.format(report.summary.packagingChoiceResult))}</strong><br>Resultado por unidade contra a melhor apresentação alternativa.</p>` : ""}
<section class="metrics"><div class="metric"><span>Valor da compra</span><strong>${escapeHtml(MONEY.format(report.summary.estimatedAwardedValue))}</strong></div><div class="metric"><span>Produtos comprados</span><strong>${report.summary.purchasedItemCount} de ${report.summary.itemCount}</strong></div><div class="metric"><span>Participantes</span><strong>${report.summary.supplierCount}</strong></div></section>
${incompleteCoverage ? `<p class="notice">O valor total e a economia incluem ${report.summary.calculablePurchasedItems} de ${report.summary.purchasedItemCount} produtos comprados. Os demais não possuem conversão suficiente para calcular o total com segurança.</p>` : ""}
<h2 class="section-heading">Produtos cotados</h2>${groups}
<p class="footer">Resumo gerado em ${escapeHtml(DATE.format(new Date(report.generatedAt)))}. Para consultar todos os preços e cálculos, abra o relatório completo.</p>
</main></body></html>`;
}
