"use client";

import type { KeyboardEvent } from "react";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendWhatsAppMessageAction } from "@/features/whatsapp/actions";

export function WhatsAppMessageComposer({
  conversationId,
  enabled,
}: {
  conversationId: string;
  enabled: boolean;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form action={sendWhatsAppMessageAction} className="border-border bg-surface flex shrink-0 items-end gap-2 border-t p-3">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <textarea
        name="message"
        required
        maxLength={4000}
        rows={2}
        disabled={!enabled}
        placeholder={enabled ? "Escreva uma mensagem…" : "WhatsApp desconectado"}
        onKeyDown={handleKeyDown}
        className="border-input bg-background text-fg placeholder:text-fg-subtle min-h-10 min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-60"
      />
      <Button type="submit" size="icon-lg" disabled={!enabled} aria-label="Enviar">
        <Send aria-hidden />
      </Button>
    </form>
  );
}
