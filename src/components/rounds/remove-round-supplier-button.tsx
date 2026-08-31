"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  removeRoundSupplier,
  type RoundFormState,
} from "@/features/rounds/actions";

/**
 * Tirar um fornecedor da rodada ainda em preparação.
 *
 * POR QUE AQUI NÃO SE PEDE MOTIVO
 *
 * O editor de distribuição, que serve à rodada JÁ EM ANDAMENTO, abre um
 * formulário e exige justificativa: lá o convite saiu, o link está de pé e
 * pode haver preço recebido — retirar é um fato comercial que alguém vai
 * querer explicar depois.
 *
 * Em preparação nada disso aconteceu. Nenhum link foi enviado, nenhuma
 * resposta existe, nenhum número muda. Retirar aqui é o mesmo gesto de tirar
 * um produto da lista, e é assim que se comporta: um clique, sem cerimônia.
 *
 * A RPC exige motivo em qualquer situação, então mandamos o que de fato
 * aconteceu — a retirada foi durante a montagem. É mais honesto no histórico
 * do que um campo vazio, e melhor do que obrigar a pessoa a inventar frase
 * para algo que ainda não saiu do rascunho.
 *
 * A retirada não é uma porta de mão única: `rpc_upsert_round_supplier_groups`
 * limpa `removed_at` ao reencontrar o fornecedor, então convidar de novo o
 * traz de volta. Por isso o clique não pede confirmação.
 */
export function RemoveRoundSupplierButton({
  roundId,
  roundSupplierId,
  supplierName,
}: {
  roundId: string;
  roundSupplierId: string;
  supplierName: string;
}) {
  const [state, action] = useActionState<RoundFormState, FormData>(
    removeRoundSupplier,
    { error: null },
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="roundId" value={roundId} />
        <input
          type="hidden"
          name="roundSupplierId"
          value={roundSupplierId}
        />
        <input
          type="hidden"
          name="reason"
          value="Retirado durante a montagem da rodada"
        />
        <BotaoRetirar supplierName={supplierName} />
      </form>
      {state.error ? (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function BotaoRetirar({ supplierName }: { supplierName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      className="text-destructive"
      disabled={pending}
      aria-label={`Retirar ${supplierName} da rodada`}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </Button>
  );
}
