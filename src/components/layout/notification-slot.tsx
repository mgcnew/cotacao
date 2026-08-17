import { Bell } from "lucide-react";

import { NotificationBell } from "@/components/layout/notification-bell";
import {
  countUnread,
  listNotifications,
} from "@/features/notifications/queries";

/**
 * O sino, carregado fora do caminho crítico.
 *
 * Ele custava duas consultas no `layout`, e o layout é o que precisa ficar
 * pronto primeiro: enquanto ele não resolve, nem a casca da página aparece — e
 * o mesmo vale para cada prefetch que o Next dispara ao ver um link na tela.
 * Numa lista de vinte pedidos isso eram quarenta consultas de notificação para
 * desenhar uma tela que ninguém pediu ainda.
 *
 * Aqui dentro elas continuam existindo; o que mudou é que ninguém espera por
 * elas. O sino aparece apagado e ganha o número quando a conta chega.
 */
export async function NotificationSlot({ companyId }: { companyId: string }) {
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(companyId),
    countUnread(companyId),
  ]);

  return (
    <NotificationBell notifications={notifications} unreadCount={unreadCount} />
  );
}

/**
 * O sino antes da contagem chegar.
 *
 * Mesmo tamanho e mesma posição do de verdade, para o cabeçalho não se mexer
 * quando ele entrar. Sem `aria-label` de notificação e sem foco: anunciar um
 * botão que ainda não faz nada é pior do que não anunciar nada.
 */
export function NotificationSlotFallback() {
  return (
    <div
      aria-hidden
      className="text-fg-subtle grid size-8 place-items-center rounded-md"
    >
      <Bell className="size-4" />
    </div>
  );
}
