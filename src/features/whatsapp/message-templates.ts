export const WHATSAPP_TEMPLATE_KINDS = [
  "quotation_invitation",
  "quotation_reminder",
  "order_confirmation",
] as const;

export type WhatsAppTemplateKind = (typeof WHATSAPP_TEMPLATE_KINDS)[number];

export const WHATSAPP_TEMPLATE_VARIABLES = [
  "contato",
  "empresa",
  "cotacao",
  "quantidade_itens",
  "link",
  "numero_pedido",
  "revisao",
  "fornecedor",
  "documento_empresa",
  "itens",
  "total",
  "prazo_entrega",
] as const;

export const WHATSAPP_TEMPLATE_VARIABLES_BY_KIND: Record<
  WhatsAppTemplateKind,
  readonly (typeof WHATSAPP_TEMPLATE_VARIABLES)[number][]
> = {
  quotation_invitation: ["contato", "empresa", "cotacao", "quantidade_itens", "link"],
  quotation_reminder: ["contato", "empresa", "cotacao", "quantidade_itens", "link"],
  order_confirmation: [
    "numero_pedido",
    "revisao",
    "empresa",
    "documento_empresa",
    "fornecedor",
    "itens",
    "total",
    "prazo_entrega",
    "link",
  ],
};

export const DEFAULT_WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKind, string> = {
  quotation_invitation: [
    "Olá, {contato}!",
    "",
    "{empresa} convida você para responder à cotação “{cotacao}”, com {quantidade_itens}.",
    "",
    "Acesse o link para informar preços e condições: {link}",
    "",
    "Se precisar, pode responder por aqui.",
  ].join("\n"),
  quotation_reminder: [
    "Olá, {contato}!",
    "",
    "Passando para lembrar que ainda aguardamos sua resposta para a cotação “{cotacao}” da {empresa}.",
    "",
    "Você pode responder por este link: {link}",
    "",
    "Se já estiver providenciando, pode desconsiderar este lembrete.",
  ].join("\n"),
  order_confirmation: [
    "*Pedido #{numero_pedido}{revisao}*",
    "{empresa}{documento_empresa}",
    "",
    "Olá, {fornecedor}! Segue nosso pedido:",
    "",
    "{itens}",
    "",
    "*Total: {total}*",
    "{prazo_entrega}",
    "",
    "Confirme o pedido ou aponte alguma divergência por aqui:",
    "{link}",
  ].join("\n"),
};

export const WHATSAPP_TEMPLATE_META: Record<
  WhatsAppTemplateKind,
  { title: string; description: string }
> = {
  quotation_invitation: {
    title: "Convite para cotação",
    description: "Enviada ao compartilhar ou reenviar uma cotação para um fornecedor.",
  },
  quotation_reminder: {
    title: "Cobrança de resposta",
    description: "Enviada aos fornecedores selecionados que ainda não concluíram a resposta.",
  },
  order_confirmation: {
    title: "Confirmação de pedido",
    description: "Enviada com itens, valores, prazo e o link para o fornecedor confirmar o pedido.",
  },
};

export function renderWhatsAppTemplate(
  body: string,
  variables: Record<string, string>,
) {
  return body.replace(/\{([a-z_]+)\}/g, (placeholder, name: string) =>
    name in variables ? variables[name] : placeholder,
  ).replace(/\n{3,}/g, "\n\n").trim();
}

export function itemCountLabel(count: number) {
  return `${count} ${count === 1 ? "produto" : "produtos"}`;
}

export function findUnsupportedTemplateVariables(body: string, kind: WhatsAppTemplateKind) {
  const allowed = new Set<string>(WHATSAPP_TEMPLATE_VARIABLES_BY_KIND[kind]);
  return [...new Set(
    [...body.matchAll(/\{([^{}]+)\}/g)]
      .map((match) => match[1])
      .filter((name) => !allowed.has(name)),
  )];
}
