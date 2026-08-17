"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  removeQuotationItem,
  renameRoundGroup,
  updateQuotationItem,
  updateRound,
  updateRoundSupplierContact,
  type RoundFormState,
} from "@/features/rounds/actions";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Número do banco no formato que a pessoa digita. */
function paraCampo(valor: number): string {
  return String(valor).replace(".", ",");
}

function Salvar({ label = "Salvar" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

type Option = { id: string; name: string };

/**
 * Fecha o painel quando a action confirma o salvamento.
 *
 * Ajuste de estado durante a renderização, e não `useEffect`: é o padrão que o
 * React recomenda para reagir a um valor novo, e evita o render em cascata que
 * um efeito com setState provoca. O `savedAt` visto fica guardado para que
 * reabrir o painel depois de salvar continue funcionando.
 */
function useFechaAoSalvar(savedAt: number | undefined) {
  const [aberto, setAberto] = React.useState(false);
  const [savedVisto, setSavedVisto] = React.useState(savedAt);

  if (savedAt !== savedVisto) {
    setSavedVisto(savedAt);
    if (savedAt) setAberto(false);
  }

  return [aberto, setAberto] as const;
}

/**
 * Corrige título e observações da rodada.
 *
 * Fechado por padrão: quem abre a Central da Rodada vem montar ou acompanhar,
 * não renomear. O botão fica discreto ao lado do título.
 */
export function EditRoundForm({
  roundId,
  title,
  notes,
}: {
  roundId: string;
  title: string;
  notes: string | null;
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    updateRound,
    { error: null },
  );
  const [open, setOpen] = useFechaAoSalvar(state.savedAt);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-3.5" aria-hidden /> Editar rodada
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="round-title" className="text-fg text-sm font-medium">
          Título
        </label>
        <Input
          id="round-title"
          name="title"
          required
          autoFocus
          maxLength={120}
          defaultValue={title}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="round-notes" className="text-fg text-sm font-medium">
          Observações <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input
          id="round-notes"
          name="notes"
          maxLength={500}
          defaultValue={notes ?? ""}
        />
      </div>

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Salvar />
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

/**
 * Uma linha da tabela de itens, que vira formulário quando editada.
 *
 * Os campos moram em células diferentes, e o `<form>` mora na célula de ações.
 * Eles se ligam pelo atributo `form`, que é HTML padrão justamente para isto —
 * a alternativa seria envolver a linha num formulário, o que não é markup
 * válido dentro de uma tabela.
 */
export function QuotationItemRow({
  roundId,
  itemId,
  productName,
  groupId,
  groupName,
  quantity,
  purchaseUnit,
  pricingUnit,
  removed,
  editable,
  groups,
  hideGroup = false,
}: {
  roundId: string;
  itemId: string;
  productName: string;
  groupId: string;
  groupName: string;
  quantity: number;
  purchaseUnit: string;
  pricingUnit: string;
  removed: boolean;
  editable: boolean;
  groups: Option[];
  /**
   * Esconde a coluna de grupo — usado quando a rodada tem só o grupo padrão e
   * a coluna repetiria "Geral" em toda linha. O valor continua sendo enviado,
   * por campo oculto: escondê-lo da tela não pode significar perdê-lo.
   */
  hideGroup?: boolean;
}) {
  const [updateState, updateAction] = useActionState<RoundFormState, FormData>(
    updateQuotationItem,
    { error: null },
  );
  const [removeState, removeAction] = useActionState<RoundFormState, FormData>(
    removeQuotationItem,
    { error: null },
  );
  const [editando, setEditando] = useFechaAoSalvar(updateState.savedAt);

  const erro = updateState.error ?? removeState.error;
  const formId = `item-${itemId}`;

  if (!editando) {
    return (
      <TableRow className={removed ? "opacity-60" : undefined}>
        <TableCell className={`font-medium ${removed ? "line-through" : ""}`}>
          {productName}
        </TableCell>
        {hideGroup ? null : (
          <TableCell className="text-fg-muted">{groupName}</TableCell>
        )}
        <TableCell className="text-right tabular-nums">
          {QTY.format(quantity)}{" "}
          <span className="text-fg-subtle text-xs">{purchaseUnit}</span>
        </TableCell>
        <TableCell className="text-fg-muted font-mono text-xs">
          {pricingUnit}
        </TableCell>
        <TableCell className="text-fg-muted text-xs">
          {removed ? "Removido da rodada" : "Aberto"}
        </TableCell>
        {editable ? (
          <TableCell>
            {removed ? null : (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-fg-subtle"
                  aria-label={`Editar ${productName}`}
                  onClick={() => setEditando(true)}
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
                <form action={removeAction}>
                  <input type="hidden" name="roundId" value={roundId} />
                  <input type="hidden" name="itemId" value={itemId} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={`Remover ${productName} da rodada`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </form>
              </div>
            )}
            {erro ? (
              <p role="alert" className="text-destructive mt-1 text-xs">
                {erro}
              </p>
            ) : null}
          </TableCell>
        ) : null}
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{productName}</TableCell>
      {hideGroup ? null : (
        <TableCell>
          <label className="sr-only" htmlFor={`grupo-${itemId}`}>
            Grupo de {productName}
          </label>
          <select
            id={`grupo-${itemId}`}
            name="groupId"
            form={formId}
            defaultValue={groupId}
            className={selectClass}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </TableCell>
      )}
      <TableCell className="text-right">
        <label className="sr-only" htmlFor={`qtd-${itemId}`}>
          Quantidade de {productName}
        </label>
        <Input
          id={`qtd-${itemId}`}
          name="quantity"
          form={formId}
          required
          inputMode="decimal"
          defaultValue={paraCampo(quantity)}
          className="h-8 w-24 text-right"
        />
      </TableCell>
      <TableCell className="text-fg-muted font-mono text-xs">
        {pricingUnit}
      </TableCell>
      <TableCell className="text-fg-subtle text-xs">editando</TableCell>
      <TableCell>
        <form action={updateAction} id={formId}>
          <input type="hidden" name="roundId" value={roundId} />
          <input type="hidden" name="itemId" value={itemId} />
          {/* Sem a coluna de grupo, o valor vem daqui — e mora DENTRO do
              formulário, não solto entre as células: `<input>` filho direto de
              `<tr>` é HTML inválido, e o navegador o joga para fora da tabela. */}
          {hideGroup ? (
            <input type="hidden" name="groupId" value={groupId} />
          ) : null}
          <div className="flex items-center justify-end gap-1">
            <Salvar label="Salvar" />
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
        </form>
        {erro ? (
          <p role="alert" className="text-destructive mt-1 text-xs">
            {erro}
          </p>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/** Um grupo da rodada, renomeável no lugar. */
export function GroupChip({
  roundId,
  groupId,
  name,
  itemCount,
  editable,
}: {
  roundId: string;
  groupId: string;
  name: string;
  itemCount: number;
  editable: boolean;
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    renameRoundGroup,
    { error: null },
  );
  const [editando, setEditando] = useFechaAoSalvar(state.savedAt);

  if (editando) {
    return (
      <form
        action={formAction}
        className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-2"
      >
        <input type="hidden" name="roundId" value={roundId} />
        <input type="hidden" name="groupId" value={groupId} />
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor={`grupo-nome-${groupId}`}>
            Novo nome do grupo {name}
          </label>
          <Input
            id={`grupo-nome-${groupId}`}
            name="name"
            required
            autoFocus
            maxLength={80}
            defaultValue={name}
            className="h-8 w-44"
          />
          <Button type="submit" size="sm" variant="ghost" aria-label="Salvar nome">
            <Check className="size-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-fg-subtle"
            aria-label="Cancelar"
            onClick={() => setEditando(false)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
        <ErrorLine error={state.error} />
      </form>
    );
  }

  return (
    <span className="border-border bg-surface-sunken flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm">
      <span className="text-fg">{name}</span>
      <span className="text-fg-subtle text-xs tabular-nums">
        {itemCount} {itemCount === 1 ? "item" : "itens"}
      </span>
      {editable ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle -mr-1.5 h-6 px-1"
          aria-label={`Renomear grupo ${name}`}
          onClick={() => setEditando(true)}
        >
          <Pencil className="size-3" aria-hidden />
        </Button>
      ) : null}
    </span>
  );
}

/**
 * Troca o contato que recebe a cotação daquele fornecedor.
 *
 * Salva ao escolher, sem botão: é um campo só, e um "Salvar" ao lado de cada
 * linha da tabela seria mais ruído do que ajuda. O `key` do formulário muda com
 * o valor salvo para que o `select` reflita o que o servidor confirmou.
 */
export function ContactPicker({
  roundId,
  roundSupplierId,
  contactId,
  contacts,
}: {
  roundId: string;
  roundSupplierId: string;
  contactId: string | null;
  contacts: { id: string; name: string; role: string | null }[];
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    updateRoundSupplierContact,
    { error: null },
  );

  if (contacts.length <= 1) return null;

  return (
    <form action={formAction} className="mt-1 flex flex-col gap-1">
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="roundSupplierId" value={roundSupplierId} />
      <label className="sr-only" htmlFor={`contato-${roundSupplierId}`}>
        Contato que recebe esta cotação
      </label>
      <select
        id={`contato-${roundSupplierId}`}
        name="contactId"
        defaultValue={contactId ?? ""}
        className={`${selectClass} h-7 text-xs`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.role ? ` · ${c.role}` : ""}
          </option>
        ))}
      </select>
      <ErrorLine error={state.error} />
    </form>
  );
}
