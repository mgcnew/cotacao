import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  type WhatsAppTemplateKind,
} from "@/features/whatsapp/message-templates";

export async function getCompanyWhatsAppTemplates(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .select("kind, body")
    .eq("company_id", companyId);
  if (error) throw new Error(`Falha ao carregar os modelos do WhatsApp: ${error.message}`);

  const templates = { ...DEFAULT_WHATSAPP_TEMPLATES };
  for (const row of data ?? []) {
    if (row.kind in templates) templates[row.kind as WhatsAppTemplateKind] = row.body;
  }
  return templates;
}
