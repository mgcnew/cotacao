export const WHATSAPP_TEMPLATE_KINDS = [
  "quotation_invitation",
  "quotation_reminder",
] as const;

export type WhatsAppTemplateKind = (typeof WHATSAPP_TEMPLATE_KINDS)[number];

export type WhatsAppTemplateVariables = {
  contato: string;
  empresa: string;
  cotacao: string;
  quantidade_itens: string;
  link: string;
};

export const WHATSAPP_TEMPLATE_VARIABLES = [
  "contato",
  "empresa",
  "cotacao",
  "quantidade_itens",
  "link",
] as const;

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
};

export function renderWhatsAppTemplate(
  body: string,
  variables: WhatsAppTemplateVariables,
) {
  return body.replace(/\{([a-z_]+)\}/g, (placeholder, name: string) =>
    name in variables ? variables[name as keyof WhatsAppTemplateVariables] : placeholder,
  );
}

export function itemCountLabel(count: number) {
  return `${count} ${count === 1 ? "produto" : "produtos"}`;
}

export function findUnsupportedTemplateVariables(body: string) {
  const allowed = new Set<string>(WHATSAPP_TEMPLATE_VARIABLES);
  return [...new Set(
    [...body.matchAll(/\{([^{}]+)\}/g)]
      .map((match) => match[1])
      .filter((name) => !allowed.has(name)),
  )];
}
