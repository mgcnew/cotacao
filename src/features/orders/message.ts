/**
 * A mensagem do pedido, do jeito que ela chega no WhatsApp do fornecedor.
 *
 * Fica em módulo comum, sem `server-only`, porque o servidor a monta e o
 * cliente a usa para montar o link do `wa.me`. É texto puro de propósito: o
 * mesmo conteúdo serve para colar no WhatsApp, no e-mail ou ditar no telefone.
 *
 * O link de confirmação é o fim da mensagem, e não o começo, porque quem lê
 * precisa saber do que se trata antes de decidir clicar em coisa nenhuma.
 */

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATA = new Intl.DateTimeFormat("pt-BR");

export type OrderMessageContext = {
  orderNumber: number;
  companyName: string;
  companyDocument: string | null;
  supplierName: string;
  deliveryDueDate: string | null;
  revisionNumber: number;
  items: {
    productName: string;
    requestedQuantity: number;
    agreedPrice: number;
    purchaseUnit: string;
    pricingUnit: string;
  }[];
};

/** Data ISO vira dd/mm/aaaa sem passar por fuso — é dia, não instante. */
function dia(iso: string): string {
  const [ano, mes, d] = iso.split("-").map(Number);
  return DATA.format(new Date(ano, mes - 1, d));
}

export function buildOrderMessage(
  ctx: OrderMessageContext,
  url: string | null,
): string {
  const total = ctx.items.reduce(
    (sum, i) => sum + i.requestedQuantity * i.agreedPrice,
    0,
  );

  const linhas = [
    `*Pedido #${ctx.orderNumber}${ctx.revisionNumber > 1 ? ` — revisão ${ctx.revisionNumber}` : ""}*`,
    ctx.companyName + (ctx.companyDocument ? ` · CNPJ ${ctx.companyDocument}` : ""),
    "",
    `Olá, ${ctx.supplierName}! Segue nosso pedido:`,
    "",
    ...ctx.items.map(
      (i) =>
        `• ${i.productName} — ${QTY.format(i.requestedQuantity)} ${i.purchaseUnit} × ${MONEY.format(i.agreedPrice)}/${i.pricingUnit}`,
    ),
    "",
    `*Total: ${MONEY.format(total)}*`,
  ];

  if (ctx.deliveryDueDate) {
    linhas.push(`Entrega prevista: ${dia(ctx.deliveryDueDate)}`);
  }

  if (url) {
    linhas.push(
      "",
      "Confirme o pedido ou aponte alguma divergência por aqui:",
      url,
    );
  }

  return linhas.join("\n");
}

/**
 * Telefone brasileiro no formato que o `wa.me` entende: só dígitos, com o 55.
 *
 * Devolve `null` quando o número não tem cara de telefone — melhor não oferecer
 * o botão do que abrir o WhatsApp num número que não existe.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) {
    return digits.startsWith("55") ? digits : null;
  }
  return null;
}

export function whatsappLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const numero = normalizePhone(phone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}
