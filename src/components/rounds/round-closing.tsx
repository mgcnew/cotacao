"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelRound,
  completeRound,
  type RoundFormState,
} from "@/features/rounds/actions";

/**
 * O fim da rodada — concluir ou cancelar.
 *
 * Os dois estados existiam no banco desde a 0007 e nenhuma tela os alcançava:
 * toda rodada já resolvida ficava para sempre em "Em andamento", e a lista de
 * compras juntava o trabalho de três meses atrás junto com o de hoje.
 *
 * São ações sem volta pela interface, então as duas confirmam. A confirmação
 * diz o que vai acontecer — quantos itens fecham sem compra, que os links
 * param de valer — em vez de perguntar "tem certeza?".
 */

function Confirmar({ label, destrutivo = false }: { label: string; destrutivo?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={destrutivo ? "destructive" : "default"}
      disabled={pending}
    >
      {pending ? "Aplicando…" : label}
    </Button>
  );
}

/** Concluir: a rodada cumpriu o papel dela. */
export function CompleteRoundForm({
  roundId,
  openItemCount,
  openGroupCount,
}: {
  roundId: string;
  /** Itens ainda sem decisão — é o que concluir vai encerrar sem compra. */
  openItemCount: number;
  openGroupCount: number;
}) {
  const [confirmando, setConfirmando] = React.useState(false);
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    completeRound,
    { error: null },
  );

  if (!confirmando) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setConfirmando(true)}
        >
          <CheckCircle2 className="size-3.5" aria-hidden /> Concluir rodada
        </Button>
        <ErrorLine error={state.error} />
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-xl border p-4 text-left"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <div>
        <h2 className="text-fg text-sm font-semibold">Concluir a rodada</h2>
        <p className="text-fg-muted mt-1 text-sm">
          {openItemCount > 0
            ? `${openItemCount} ${openItemCount === 1 ? "item ainda sem decisão vai encerrar" : "itens ainda sem decisão vão encerrar"} sem compra`
            : "Nada ficou sem decisão"}
          {openGroupCount > 0
            ? `, e ${openGroupCount} ${openGroupCount === 1 ? "grupo aberto fecha" : "grupos abertos fecham"} junto`
            : ""}
          . Os links dos fornecedores param de valer.
        </p>
        <p className="text-fg-subtle mt-1 text-xs">
          Os pedidos já gerados seguem o caminho deles, em Pedidos.
        </p>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Confirmar label="Concluir rodada" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setConfirmando(false)}
        >
          Voltar
        </Button>
      </div>
    </form>
  );
}

/** Cancelar: esta rodada não vale. Exige motivo, e o banco exige mais. */
export function CancelRoundForm({ roundId }: { roundId: string }) {
  const [confirmando, setConfirmando] = React.useState(false);
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    cancelRound,
    { error: null },
  );

  if (!confirmando) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive gap-1.5"
          onClick={() => setConfirmando(true)}
        >
          <XCircle className="size-3.5" aria-hidden /> Cancelar rodada
        </Button>
        <ErrorLine error={state.error} />
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-xl border p-4 text-left"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <div>
        <h2 className="text-fg text-sm font-semibold">Cancelar a rodada</h2>
        <p className="text-fg-muted mt-1 text-sm">
          Itens e grupos saem da rodada e os links dos fornecedores param de
          valer. Rodada que já virou pedido não pode ser cancelada — ali o
          caminho é concluir.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reason" className="text-fg text-sm font-medium">
          Motivo
        </label>
        <Input
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={200}
          autoFocus
          placeholder="compra adiada para a semana que vem"
        />
        {/* O motivo vai para o evento de domínio: daqui a seis meses, "por que
            esta rodada foi cancelada?" tem resposta. */}
        <p className="text-fg-subtle text-xs">
          Fica registrado no histórico da rodada.
        </p>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Confirmar label="Cancelar rodada" destrutivo />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setConfirmando(false)}
        >
          Voltar
        </Button>
      </div>
    </form>
  );
}
