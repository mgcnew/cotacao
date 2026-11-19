import { CheckCircle2 } from "lucide-react";
import { PRICE_FEEDBACK_LABELS, type PublicQuotationReceipt } from "@/features/quotations/receipt";
import { formatUnitPrice } from "@/lib/money";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** Só recebe respostas do próprio token e faixas calculadas no servidor. */
export function QuotationReceipt({ receipt }: { receipt?: PublicQuotationReceipt | null }) {
  if (!receipt?.items.length) return null;
  return (
    <section aria-labelledby="quotation-receipt-title" className="border-border bg-surface rounded-2xl border text-left">
      <div className="border-border border-b p-4">
        <h2 id="quotation-receipt-title" className="text-fg flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="text-success size-5 shrink-0" aria-hidden /> Resumo das suas respostas recebidas</h2>
        {receipt.submitted_at ? <p className="text-fg-muted mt-1 text-sm">Último envio recebido em {DATE.format(new Date(receipt.submitted_at))} (horário de São Paulo).</p> : null}
        <p className="text-fg-muted mt-1 text-sm">Confira os valores registrados. Para solicitar uma correção, fale com o comprador.</p>
        {receipt.comparison_enabled ? <p className="text-fg-muted mt-2 text-sm">As faixas comparam o preço que você informou com as ofertas comparáveis disponíveis agora. Podem mudar com novas respostas ou negociações. Comparação de preços; não representa decisão de compra.</p> : null}
      </div>
      <ul className="divide-border divide-y">
        {receipt.items.map((item) => (
          <li key={item.item_id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-fg text-sm font-semibold wrap-anywhere">{item.product_name}</h3>
                <p className="text-fg-muted text-sm">Quantidade solicitada: {QTY.format(item.requested_quantity)} {item.purchase_unit}</p>
              </div>
              <p className="text-fg text-sm font-medium tabular-nums">{item.does_not_supply ? "Não trabalho com este produto" : item.is_available === false ? "Sem estoque agora" : item.quoted_price !== null ? `R$ ${formatUnitPrice(item.quoted_price)} / ${item.pricing_unit}` : "Preço não informado"}</p>
            </div>
            {item.form_base_per_unit !== null ? <p className="text-fg-muted mt-1 text-sm">Cada {item.purchase_unit} com {QTY.format(item.form_base_per_unit)} {item.comparison_unit ?? "unidades"}.</p> : null}
            {item.attributes.map((attribute, index) => <p key={`${attribute.name}-${index}`} className="text-fg-muted mt-1 text-sm">{attribute.name}: {attribute.value ?? "Não informado"}{attribute.unit ? ` ${attribute.unit}` : ""}</p>)}
            {item.notes ? <p className="text-fg-muted mt-1 text-sm whitespace-pre-wrap">Observações: {item.notes}</p> : null}
            {receipt.comparison_enabled && item.comparison_band ? <p className="text-primary mt-2 text-sm font-medium">{PRICE_FEEDBACK_LABELS[item.comparison_band]}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
