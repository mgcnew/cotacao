/**
 * Tipos de divergência de pedido — espelha o CHECK de `order_divergences.type`.
 *
 * Módulo próprio, sem `"use server"`, porque é constante consumida pelo
 * formulário no cliente. Arquivo de server action só pode exportar funções
 * assíncronas.
 */
export const ORDER_DIVERGENCE_TYPES = [
  { value: "quantity", label: "Quantidade", hint: "não tenho tudo isso" },
  { value: "price", label: "Preço", hint: "o valor combinado mudou" },
  {
    value: "delivery_date",
    label: "Data de entrega",
    hint: "não consigo na data",
  },
  { value: "availability", label: "Disponibilidade", hint: "item em falta" },
  { value: "specification", label: "Especificação", hint: "produto diferente" },
  { value: "other", label: "Outro", hint: "" },
] as const;

export type OrderDivergenceType =
  (typeof ORDER_DIVERGENCE_TYPES)[number]["value"];

export const ORDER_DIVERGENCE_TYPE_LABEL: Record<string, string> =
  Object.fromEntries(ORDER_DIVERGENCE_TYPES.map((t) => [t.value, t.label]));

export const ORDER_DIVERGENCE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceita",
  rejected: "Recusada",
  resolved: "Resolvida",
  cancelled: "Cancelada",
};

/** Situações que o comprador pode dar a uma divergência pendente. */
export const ORDER_DIVERGENCE_RESOLUTIONS = [
  { value: "accepted", label: "Aceitar" },
  { value: "rejected", label: "Recusar" },
  { value: "resolved", label: "Resolvida" },
  { value: "cancelled", label: "Cancelar" },
] as const;

export const COMMERCIAL_DIVERGENCE_RESOLUTIONS = [
  { value: "accepted", label: "Aceitar a diferença" },
  { value: "to_dispute", label: "Contestar" },
  { value: "justified", label: "Justificada" },
  { value: "resolved", label: "Resolvida" },
] as const;

export const COMMERCIAL_DIVERGENCE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceita",
  to_dispute: "Em contestação",
  resolved: "Resolvida",
  justified: "Justificada",
};

export const COMMERCIAL_DIVERGENCE_TYPE_LABEL: Record<string, string> = {
  price: "Preço diferente do combinado",
  quantity: "Quantidade acima do combinado",
  specification: "Produto diferente do combinado",
  other: "Outra divergência no recebimento",
};
