"use client";

import { Plus, UsersRound } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  convidarFornecedoresSugeridos,
  type RoundFormState,
} from "@/features/rounds/actions";

function Enviar({
  rotulo,
  ocupado,
  variante,
  icone,
  rotuloAcessivel,
}: {
  rotulo: string;
  ocupado: string;
  variante: "default" | "outline";
  icone: "um" | "varios";
  rotuloAcessivel?: string;
}) {
  const { pending } = useFormStatus();
  const Icone = icone === "um" ? Plus : UsersRound;
  return (
    <Button
      type="submit"
      size="sm"
      variant={variante}
      disabled={pending}
      aria-label={rotuloAcessivel}
      className="h-10 gap-1.5 sm:h-8"
    >
      <Icone className="size-3.5" aria-hidden />
      {pending ? ocupado : rotulo}
    </Button>
  );
}

/**
 * Convida um ou vários fornecedores sugeridos. Os grupos de cada um são
 * decididos no servidor, a partir dos produtos que ele já vendeu.
 */
export function ConvidarSugeridos({
  roundId,
  supplierIds,
  rotulo,
  rotuloAcessivel,
  variante = "default",
}: {
  roundId: string;
  supplierIds: string[];
  rotulo: string;
  /** Quando o rótulo visível não diz a quem o botão se refere. */
  rotuloAcessivel?: string;
  variante?: "default" | "outline";
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    convidarFornecedoresSugeridos,
    { error: null },
  );
  const varios = supplierIds.length > 1;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="roundId" value={roundId} />
      {supplierIds.map((id) => (
        <input key={id} type="hidden" name="supplierId" value={id} />
      ))}
      <Enviar
        rotulo={rotulo}
        rotuloAcessivel={rotuloAcessivel}
        ocupado="Convidando…"
        variante={variante}
        icone={varios ? "varios" : "um"}
      />
      {state.error ? (
        <p
          role="alert"
          className="text-destructive max-w-xs text-right text-xs"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
