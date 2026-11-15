"use client";

import { CalendarX, ChevronRight, Clock3, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  dismissPurchaseSchedule,
  snoozePurchaseSchedule,
} from "@/features/suppliers/schedule-actions";

/**
 * Uma ação à vista e o resto atrás de "…".
 *
 * Eram quatro botões lado a lado em cada compra habitual, todos com o mesmo
 * peso. A ação do dia é montar o pedido (ou a cotação, para quem não pode
 * pedir direto); adiar e ignorar são exceção e ficam no menu — o que também
 * afasta "Ignorar este dia", que não tem desfazer, do toque distraído.
 *
 * Adiar e ignorar saem por transição, não por `<form>`: o menu fecha no
 * clique e um botão de submit desmontado junto com ele não enviaria nada.
 */
export function PurchaseAlertActions({
  scheduleId,
  occurrenceDate,
  supplierId,
  supplierName,
  canCreateRound,
  canCreateOrder,
  canManageSchedule,
}: {
  scheduleId: string;
  occurrenceDate: string;
  supplierId: string;
  supplierName: string;
  canCreateRound: boolean;
  canCreateOrder: boolean;
  canManageSchedule: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const pedido = `/pedidos/novo?fornecedor=${supplierId}&agenda=${scheduleId}`;
  const cotacao = `/compras/nova?fornecedor=${supplierId}&agenda=${scheduleId}`;
  const cotacaoNoMenu = canCreateOrder && canCreateRound;
  const temMenu = cotacaoNoMenu || canManageSchedule;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {canCreateOrder || canCreateRound ? (
        <Button asChild size="sm" className="h-10 sm:h-8" disabled={pending}>
          <Link href={canCreateOrder ? pedido : cotacao}>
            {canCreateOrder ? "Montar pedido" : "Criar cotação"}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      ) : null}

      {temMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-10 sm:size-8"
              disabled={pending}
              aria-label={`Mais ações para ${supplierName}`}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {cotacaoNoMenu ? (
              <DropdownMenuItem asChild>
                <Link href={cotacao}>Criar cotação</Link>
              </DropdownMenuItem>
            ) : null}
            {cotacaoNoMenu && canManageSchedule ? (
              <DropdownMenuSeparator />
            ) : null}
            {canManageSchedule ? (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    startTransition(async () => {
                      await snoozePurchaseSchedule(scheduleId);
                    })
                  }
                >
                  <Clock3 aria-hidden />
                  Lembrar amanhã
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    startTransition(async () => {
                      await dismissPurchaseSchedule(scheduleId, occurrenceDate);
                    })
                  }
                >
                  <CalendarX aria-hidden />
                  Ignorar este dia
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
