export function normalizeWhatsAppPhone(value: string | null | undefined) {
  if (!value) return "";
  const digits = value.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function phonesEquivalent(a: string, b: string) {
  const left = normalizeWhatsAppPhone(a);
  const right = normalizeWhatsAppPhone(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Permite comparar um cadastro local sem DDI com o JID entregue pelo
  // WhatsApp. Dez dígitos preservam DDD + número e evitam casar só o final.
  return left.length >= 10 && right.length >= 10 && left.slice(-10) === right.slice(-10);
}

export function jidCanBeMatchedToPhone(remoteJid: string) {
  return !remoteJid.endsWith("@lid") && !remoteJid.endsWith("@g.us");
}
