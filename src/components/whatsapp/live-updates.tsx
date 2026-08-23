"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { markWhatsAppConversationReadAction } from "@/features/whatsapp/actions";
import { createClient } from "@/lib/supabase/client";

export function WhatsAppLiveUpdates({
  companyId,
  conversationId,
  canMarkRead,
}: {
  companyId: string;
  conversationId?: string;
  canMarkRead: boolean;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const channel = supabase
      .channel(`whatsapp:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${companyId}` }, refresh)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [companyId, router]);

  useEffect(() => {
    if (conversationId && canMarkRead) {
      void markWhatsAppConversationReadAction(conversationId);
    }
  }, [canMarkRead, conversationId]);

  return null;
}

export function ScrollMessagesToBottom() {
  useEffect(() => {
    document.querySelector("[data-whatsapp-messages-end]")?.scrollIntoView({ block: "end" });
  }, []);
  return null;
}
