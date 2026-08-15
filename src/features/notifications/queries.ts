import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Notificações do usuário.
 *
 * A RLS de `notifications` só devolve as do próprio usuário (`user_id =
 * auth.uid()`), então não há filtro por usuário aqui — pedir ao banco o que
 * ele já garante seria redundância que engana o leitor.
 *
 * Quem cria é o gatilho `domain_events_fanout_notification`. O app tem apenas
 * SELECT e UPDATE: lê as suas e marca como lida.
 */

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  priority: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listNotifications(
  companyId: string,
  limit = 20,
): Promise<Notification[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, priority, action_url, read_at, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao carregar notificações: ${error.message}`);

  return (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    actionUrl: n.action_url,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function countUnread(companyId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("read_at", null);

  if (error) throw new Error(`Falha ao contar notificações: ${error.message}`);
  return count ?? 0;
}
