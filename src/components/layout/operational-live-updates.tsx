"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

const SUPPLIER_RESPONSE_EVENTS = new Set([
  "quotation.response_submitted",
  "order.confirmed",
  "order.divergence_created",
]);

/**
 * Atualiza a rota aberta quando um fornecedor conclui uma ação pública.
 *
 * As RPCs emitem `domain_events` somente depois de persistirem toda a resposta,
 * então um único evento basta para recarregar página, modais e notificações sem
 * provocar uma sequência de refreshes para cada item da cotação.
 */
export function OperationalLiveUpdates({ companyId }: { companyId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`supplier-responses:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "domain_events",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          if (!SUPPLIER_RESPONSE_EVENTS.has(payload.new.event_type as string)) {
            return;
          }

          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 250);
        },
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [companyId, router]);

  return null;
}
