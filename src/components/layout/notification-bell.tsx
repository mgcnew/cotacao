"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/actions";
import type { Notification } from "@/features/notifications/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Sino com a lista das últimas notificações.
 *
 * Abre em painel, não em página: notificação é passagem para outro lugar, não
 * destino. Clicar leva ao recurso e marca como lida na mesma ação.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: Notification[];
  unreadCount: number;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `Notificações, ${unreadCount} não lidas`
            : "Notificações"
        }
        aria-expanded={open}
        className="text-fg-muted hover:bg-surface-muted hover:text-fg relative grid size-8 place-items-center rounded-md transition-colors duration-(--dur)"
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="bg-primary text-primary-fg absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Clicar fora fecha, sem precisar acertar o sino de novo. */}
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div
            className={cn(
              "border-border bg-surface fixed inset-x-2 top-14 z-50 flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-xl border shadow-lg",
              "sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80 sm:max-w-[90vw]",
            )}
          >
            <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-fg text-sm font-medium">Notificações</span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 ? (
                  <form action={markAllNotificationsRead}>
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="text-fg-subtle h-6 px-1.5 text-xs"
                    >
                      Marcar todas
                    </Button>
                  </form>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  className="text-fg-subtle hover:text-fg grid size-6 place-items-center rounded"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <p className="text-fg-muted px-3 py-8 text-center text-sm">
                Nada por aqui. Você é avisado quando um fornecedor responde,
                confirma um pedido ou aponta divergência.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto sm:max-h-96">
                {notifications.map((n) => {
                  const conteudo = (
                    <>
                      <span className="flex items-start gap-2">
                        {!n.readAt ? (
                          <span
                            className={cn(
                              "mt-1.5 size-1.5 shrink-0 rounded-full",
                              n.priority === "high" || n.priority === "critical"
                                ? "bg-destructive"
                                : "bg-primary",
                            )}
                            aria-hidden
                          />
                        ) : (
                          <span className="mt-1.5 size-1.5 shrink-0" aria-hidden />
                        )}
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block break-words text-sm",
                              n.readAt
                                ? "text-fg-muted"
                                : "text-fg font-medium",
                            )}
                          >
                            {n.title}
                          </span>
                          {n.message ? (
                            <span className="text-fg-muted block break-words text-xs">
                              {n.message}
                            </span>
                          ) : null}
                          <span className="text-fg-subtle block text-xs">
                            {QUANDO.format(new Date(n.createdAt))}
                          </span>
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li key={n.id} className="border-border border-b last:border-0">
                      {n.actionUrl ? (
                        <Link
                          href={n.actionUrl}
                          onClick={() => {
                            setOpen(false);
                            if (!n.readAt) void markNotificationRead(n.id);
                          }}
                          className="hover:bg-surface-muted block px-3 py-2.5 transition-colors duration-(--dur)"
                        >
                          {conteudo}
                        </Link>
                      ) : (
                        <div className="px-3 py-2.5">{conteudo}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
