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
    "quantidade_itens",
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
    "Olá, {fornecedor}! Você recebeu um novo pedido.",
    "",
    "*Pedido #{numero_pedido}{revisao}*",
    "{empresa}{documento_empresa}",
    "{quantidade_itens}",
    "",
    "{prazo_entrega}",
    "",
    "Abra o link para consultar os produtos, conferir as quantidades e confirmar o atendimento:",
    "",
    "{link}",
    "",
    "*Confirme em até 1 hora.* Se houver algum item indisponível ou divergência, informe pelo link.",
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
    description: "Avisa sobre o pedido, informa o prazo de confirmação e direciona o fornecedor ao link, sem listar os produtos.",
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
      .filter(
        (name) =>
          !(kind === "order_confirmation" && name === "total") &&
          !allowed.has(name),
      ),
  )];
}
