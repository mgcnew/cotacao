"use server";

import { revalidatePath } from "next/cache";

import { requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Marcar como lida é a única escrita que o usuário tem em notifications —
 * `authenticated` só recebeu SELECT e UPDATE, e a policy limita às próprias.
 * Criar é exclusividade do gatilho em domain_events.
 */
export async function markNotificationRead(notificationId: string) {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("company_id", company.companyId)
    .is("read_at", null);

  if (error) {
    throw new Error(`Não foi possível marcar como lida: ${error.message}`);
  }

  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("company_id", company.companyId)
    .is("read_at", null);

  if (error) {
    throw new Error(`Não foi possível marcar como lidas: ${error.message}`);
  }

  revalidatePath("/", "layout");
}
