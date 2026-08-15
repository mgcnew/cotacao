/**
 * Canais de negociação — espelha o CHECK de `negotiations.channel`.
 *
 * Mora em módulo próprio, e não junto da server action, porque um arquivo
 * `"use server"` só pode exportar funções assíncronas: qualquer constante
 * exportada de lá quebra em tempo de execução, mesmo compilando sem erro.
 */
export const NEGOTIATION_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Telefone" },
  { value: "in_person", label: "Pessoalmente" },
  { value: "other", label: "Outro" },
] as const;

export type NegotiationChannel = (typeof NEGOTIATION_CHANNELS)[number]["value"];
