"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { markWhatsAppConversationReadAction } from "@/features/whatsapp/actions";
import { loadBrowserClient, whenIdle } from "@/lib/supabase/realtime";

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
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };

    // Depois que a tela abriu: ver `lib/supabase/realtime.ts`.
    const cancelIdle = whenIdle(() => {
      void loadBrowserClient().then((supabase) => {
        if (cancelled) return;
        const channel = supabase
          .channel(`whatsapp:${companyId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter: `company_id=eq.${companyId}` }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${companyId}` }, refresh)
          .subscribe();
        unsubscribe = () => void supabase.removeChannel(channel);
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      if (timer.current) clearTimeout(timer.current);
      unsubscribe?.();
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
