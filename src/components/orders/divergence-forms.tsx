"use client";

import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  closeOrderBalance,
  resolveCommercialDivergence,
  resolveOrderDivergence,
  type OrderActionState,
} from "@/features/orders/actions";
import {
  COMMERCIAL_DIVERGENCE_RESOLUTIONS,
  ORDER_DIVERGENCE_RESOLUTIONS,
  ORDER_DIVERGENCE_TYPES,
} from "@/features/orders/divergences";
import {
  reportOrderDivergence,
  type DivergenceState,
} from "@/features/orders/public-actions";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function Submit({
  label,
  busy,
  variant = "default",
}: {
  label: string;
  busy: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

/** Lado do fornecedor: avisar que algo do pedido não fecha. */
export function ReportDivergenceForm({
  token,
  items,
}: {
  token: string;
  items: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<DivergenceState, FormData>(
    reportOrderDivergence,
    { error: null },
  );

  if (state.reported) {
    return (
      <div className="border-border bg-surface text-fg-muted rounded-xl border px-4 py-6 text-center text-sm">
        <p className="text-fg font-medium">Divergência enviada.</p>
        <p className="mt-1">
          O comprador foi avisado e vai retomar o contato. O pedido fica parado
          até isso ser resolvido.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full gap-1.5 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="size-4" aria-hidden />
        Algo está errado neste pedido
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="token" value={token} />

      <div>
        <p className="text-fg text-sm font-medium">O que está diferente?</p>
        <p className="text-fg-muted mt-1 text-sm">
          Melhor avisar agora do que confirmar e não conseguir entregar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="public-divergence-type"
            className="text-fg-muted text-xs font-medium"
          >
            Tipo da diferença
          </label>
          <ThemedSelect
            id="public-divergence-type"
            name="type"
            required
            placeholder="Selecione…"
            options={ORDER_DIVERGENCE_TYPES.map((type) => ({
              value: type.value,
              label: type.hint ? `${type.label} — ${type.hint}` : type.label,
            }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="public-divergence-item"
            className="text-fg-muted text-xs font-medium"
          >
            Produto afetado
          </label>
          <ThemedSelect
            id="public-divergence-item"
            name="orderRevisionItemId"
            emptyOptionLabel="O pedido inteiro"
            options={items.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>
      </div>

      <textarea
        name="notes"
        required
        maxLength={300}
        placeholder="Explique para o comprador (obrigatório)"
        rows={3}
        className="border-input bg-transparent text-fg placeholder:text-fg-subtle focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3"
      />

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Submit label="Enviar divergência" busy="Enviando…" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Lado do comprador: decidir o que fazer com o que o fornecedor apontou. */
export function ResolveDivergenceForm({
  divergenceId,
  orderId,
  commercial = false,
}: {
  divergenceId: string;
  orderId: string;
  commercial?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    commercial ? resolveCommercialDivergence : resolveOrderDivergence,
    { error: null },
  );

  const options = commercial
    ? COMMERCIAL_DIVERGENCE_RESOLUTIONS
    : ORDER_DIVERGENCE_RESOLUTIONS;

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Resolver
      </Button>
    );
  }

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken mt-2 flex w-full flex-col gap-2 rounded-lg border p-2"
    >
      <input type="hidden" name="divergenceId" value={divergenceId} />
      <input type="hidden" name="orderId" value={orderId} />

      <select name="status" required defaultValue="" className={selectClass}>
        <option value="" disabled>
          O que fazer?
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <Input
        name="notes"
        maxLength={300}
        placeholder="Observação (opcional)"
        className="h-8"
      />

      <ErrorLine error={state.error} />

      <p className="text-fg-subtle text-xs">
        Registra a decisão. Mudar quantidade ou preço do pedido exige uma nova
        revisão.
      </p>

      <div className="flex items-center gap-2">
        <Submit label="Registrar" busy="Registrando…" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Encerra o que não vai ser entregue, sem mexer no que já entrou. */
export function CloseBalanceForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    closeOrderBalance,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-fg-muted"
        onClick={() => setOpen(true)}
      >
        Encerrar saldo pendente
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <p className="text-fg text-sm font-medium">Encerrar saldo pendente</p>
        <p className="text-fg-muted mt-1 text-sm">
          Use quando o resto não vem mesmo. O pedido passa a recebido e os
          números já recebidos ficam como estão — nada é alterado para trás.
        </p>
      </div>

      <Input
        name="reason"
        required
        maxLength={300}
        placeholder="Motivo (obrigatório)"
      />

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Submit label="Encerrar saldo" busy="Encerrando…" variant="outline" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
