"use client";

import { Pencil, X } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { useFechaAoSalvar } from "@/components/layout/fecha-ao-salvar";
import { ErrorLine } from "@/components/layout/form-feedback";
import { IntentPrefetchLink } from "@/components/layout/intent-prefetch-link";
import { ResponseProgress } from "@/components/rounds/response-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { updateRound, type RoundFormState } from "@/features/rounds/actions";
import {
  ROUND_STATUS_LABEL,
  roundStatusTone,
  type RoundNextStep,
} from "@/features/rounds/status";

/**
 * Uma linha da lista de compras, que vira formulário quando editada.
 *
 * POR QUE NA LINHA, E NÃO NO MODAL
 *
 * Corrigir o título de uma rodada é o oposto de montá-la: são dois campos e
 * cinco segundos. Abrir a Central inteira — cinco consultas, três seções, a
 * trilha de montagem — para trocar uma palavra é caro para quem espera e
 * ruidoso para quem lê. Aqui a linha se abre no lugar, e o resto da tabela
 * continua na tela para comparar.
 *
 * A linha inteira é componente de cliente porque agora ela tem dois estados. É
 * pouco código no navegador: o que ela desenha são células de texto, e os
 * pedaços caros continuam no servidor.
 *
 * Os campos ocupam uma célula só, com `colSpan`, em vez de morarem cada um na
 * sua coluna: "observações" não tem coluna nenhuma, e espremer um campo de 500
 * caracteres na coluna de "Pedidos" seria pior do que não editar.
 */

export type RoundRowData = {
  id: string;
  title: string;
  notes: string | null;
  /** Já formatada no servidor — data montada aqui divergiria na hidratação. */
  criadaEm: string;
  totalItems: number;
  suppliersCompleted: number;
  totalSuppliers: number;
  ordersCreated: number;
  status: string;
};

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

export function RoundRow({
  round,
  passo,
  podeAgir,
  podeEditar,
}: {
  round: RoundRowData;
  passo: RoundNextStep;
  /** O próximo passo é desta pessoa? Se não, o botão vira só a porta de entrada. */
  podeAgir: boolean;
  podeEditar: boolean;
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    updateRound,
    { error: null },
  );
  const [editando, setEditando] = useFechaAoSalvar(state.savedAt);

  if (editando) {
    return (
      <TableRow>
        {/* `colSpan` maior do que o número de colunas visíveis é encurtado pelo
            navegador — então o mesmo 7 serve ao celular, que mostra três. */}
        <TableCell colSpan={7} className="py-3">
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="roundId" value={round.id} />

            <div className="grid gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,2fr)_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`titulo-${round.id}`}
                  className="text-fg text-xs font-medium"
                >
                  Título
                </label>
                <Input
                  id={`titulo-${round.id}`}
                  name="title"
                  required
                  autoFocus
                  maxLength={120}
                  defaultValue={round.title}
                  className="h-8"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`obs-${round.id}`}
                  className="text-fg text-xs font-medium"
                >
                  Observações{" "}
                  <span className="text-fg-subtle font-normal">(opcional)</span>
                </label>
                <Input
                  id={`obs-${round.id}`}
                  name="notes"
                  maxLength={500}
                  defaultValue={round.notes ?? ""}
                  className="h-8"
                />
              </div>

              <div className="flex items-center gap-1">
                <Salvar />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-fg-subtle"
                  onClick={() => setEditando(false)}
                >
                  <X className="size-3.5" aria-hidden />
                  <span className="sr-only">Cancelar edição</span>
                </Button>
              </div>
            </div>

            <ErrorLine error={state.error} />
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-1">
          <IntentPrefetchLink
            href={`/compras/${round.id}`}
            className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline"
          >
            {round.title}
          </IntentPrefetchLink>
          {podeEditar ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-fg-subtle size-6 shrink-0 p-0"
              aria-label={`Editar ${round.title}`}
              onClick={() => setEditando(true)}
            >
              <Pencil className="size-3" aria-hidden />
            </Button>
          ) : null}
        </span>
        <span className="text-fg-muted block max-w-36 text-xs whitespace-normal tabular-nums sm:hidden">
          {round.totalItems} {round.totalItems === 1 ? "produto" : "produtos"} ·{" "}
          {round.suppliersCompleted} de {round.totalSuppliers} responderam
        </span>
      </TableCell>
      <TableCell className="text-fg-muted hidden text-xs tabular-nums lg:table-cell">
        {round.criadaEm}
      </TableCell>
      <TableCell className="text-fg-muted hidden text-right tabular-nums sm:table-cell">
        {round.totalItems}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <ResponseProgress
          completed={round.suppliersCompleted}
          total={round.totalSuppliers}
        />
      </TableCell>
      <TableCell className="text-fg-muted hidden text-right tabular-nums lg:table-cell">
        {round.ordersCreated}
      </TableCell>
      <TableCell>
        <Badge variant={roundStatusTone(round.status)}>
          {ROUND_STATUS_LABEL[round.status] ?? round.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          asChild
          size="sm"
          variant={passo.pending && podeAgir ? "default" : "outline"}
        >
          <IntentPrefetchLink href={`/compras/${round.id}${passo.path}`}>
            <span className="hidden sm:inline">
              {podeAgir ? passo.label : "Abrir"}
            </span>
            <span className="sm:hidden">
              {podeAgir ? passo.shortLabel : "Abrir"}
            </span>
          </IntentPrefetchLink>
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * A tabela é eficiente no desktop, mas três colunas ainda disputam espaço em
 * 320–430 px. No celular a mesma rodada vira um cartão; acima de `sm`, a página
 * continua usando `RoundRow` sem nenhuma mudança visual.
 */
export function RoundMobileCard({
  round,
  passo,
  podeAgir,
  podeEditar,
}: {
  round: RoundRowData;
  passo: RoundNextStep;
  podeAgir: boolean;
  podeEditar: boolean;
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    updateRound,
    { error: null },
  );
  const [editando, setEditando] = useFechaAoSalvar(state.savedAt);

  if (editando) {
    return (
      <form
        data-slot="adaptive-row"
        action={formAction}
        className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-xs"
      >
        <input type="hidden" name="roundId" value={round.id} />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`titulo-mobile-${round.id}`}
            className="text-fg text-xs font-medium"
          >
            Título
          </label>
          <Input
            id={`titulo-mobile-${round.id}`}
            name="title"
            required
            autoFocus
            maxLength={120}
            defaultValue={round.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`obs-mobile-${round.id}`}
            className="text-fg text-xs font-medium"
          >
            Observações{" "}
            <span className="text-fg-subtle font-normal">(opcional)</span>
          </label>
          <Input
            id={`obs-mobile-${round.id}`}
            name="notes"
            maxLength={500}
            defaultValue={round.notes ?? ""}
          />
        </div>
        <ErrorLine error={state.error} />
        <div className="flex items-center gap-2">
          <Salvar />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <article
      data-slot="adaptive-row"
      className="border-border bg-surface rounded-xl border p-4 shadow-xs"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex min-w-0 items-start gap-1">
            <IntentPrefetchLink
              href={`/compras/${round.id}`}
              className="text-fg hover:text-primary min-w-0 font-medium break-words underline-offset-4 hover:underline"
            >
              {round.title}
            </IntentPrefetchLink>
            {podeEditar ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-fg-subtle shrink-0"
                aria-label={`Editar ${round.title}`}
                onClick={() => setEditando(true)}
              >
                <Pencil className="size-3" aria-hidden />
              </Button>
            ) : null}
          </span>
          <p className="text-fg-subtle mt-1 text-xs">Criada {round.criadaEm}</p>
        </div>
        <Badge className="shrink-0" variant={roundStatusTone(round.status)}>
          {ROUND_STATUS_LABEL[round.status] ?? round.status}
        </Badge>
      </div>

      <dl className="border-border mt-3 grid grid-cols-3 gap-2 border-y py-3 text-center">
        <div>
          <dt className="text-fg-subtle text-[11px]">Produtos</dt>
          <dd className="text-fg mt-0.5 font-medium tabular-nums">
            {round.totalItems}
          </dd>
        </div>
        <div className="border-border border-x px-1">
          <dt className="text-fg-subtle text-[11px]">Responderam</dt>
          <dd className="text-fg mt-0.5 font-medium tabular-nums">
            {round.suppliersCompleted}/{round.totalSuppliers}
          </dd>
        </div>
        <div>
          <dt className="text-fg-subtle text-[11px]">Pedidos</dt>
          <dd className="text-fg mt-0.5 font-medium tabular-nums">
            {round.ordersCreated}
          </dd>
        </div>
      </dl>

      <Button
        asChild
        size="sm"
        className="mt-3 w-full"
        variant={passo.pending && podeAgir ? "default" : "outline"}
      >
        <IntentPrefetchLink href={`/compras/${round.id}${passo.path}`}>
          {podeAgir ? passo.label : "Abrir rodada"}
        </IntentPrefetchLink>
      </Button>
    </article>
  );
}
