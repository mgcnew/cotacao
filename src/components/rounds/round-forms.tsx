"use client";

import { Play } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activateRound,
  addQuotationItem,
  addRoundSupplier,
  createRound,
  createRoundGroup,
  type RoundFormState,
} from "@/features/rounds/actions";

type Option = { id: string; name: string };

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

/** Criação da rodada, na página própria. */
export function RoundForm() {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    createRound,
    { error: null },
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-fg text-sm font-medium">
          Título
        </label>
        <Input
          id="title"
          name="title"
          required
          autoFocus
          maxLength={120}
          placeholder="Compra semanal — 3ª semana de agosto"
        />
        <p className="text-fg-subtle text-xs">
          É como a rodada aparece na lista e no que você vai procurar depois.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-fg text-sm font-medium">
          Observações <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input id="notes" name="notes" maxLength={500} />
      </div>

      <ErrorLine error={state.error} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          A rodada nasce em preparação. Nada é enviado até você iniciá-la.
        </p>
        <Submit label="Criar rodada" />
      </div>
    </form>
  );
}

export function GroupForm({ roundId }: { roundId: string }) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    createRoundGroup,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="group-name" className="text-fg text-sm font-medium">
          Novo grupo
        </label>
        <Input
          id="group-name"
          name="name"
          required
          maxLength={80}
          placeholder="Produtos para feijoada"
        />
        <p className="text-fg-subtle text-xs">
          Grupo é organização da cotação, diferente da categoria do produto.
        </p>
      </div>
      <ErrorLine error={state.error} />
      <div className="flex justify-end">
        <Submit label="Adicionar grupo" />
      </div>
    </form>
  );
}

export function ItemForm({
  roundId,
  groups,
  products,
}: {
  roundId: string;
  groups: Option[];
  products: Option[];
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    addQuotationItem,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="productId" className="text-fg text-sm font-medium">
            Produto
          </label>
          <select id="productId" name="productId" required className={selectClass}>
            <option value="">Selecione…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="groupId" className="text-fg text-sm font-medium">
            Grupo
          </label>
          <select id="groupId" name="groupId" required className={selectClass}>
            <option value="">Selecione…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="quantity" className="text-fg text-sm font-medium">
            Quantidade
          </label>
          <Input
            id="quantity"
            name="quantity"
            required
            inputMode="decimal"
            placeholder="100"
          />
        </div>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          As unidades vêm do cadastro do produto e ficam gravadas no item.
        </p>
        <Submit label="Adicionar item" />
      </div>
    </form>
  );
}

export function SupplierPickerForm({
  roundId,
  suppliers,
}: {
  roundId: string;
  suppliers: Option[];
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    addRoundSupplier,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplierId" className="text-fg text-sm font-medium">
          Convidar fornecedor
        </label>
        <select id="supplierId" name="supplierId" required className={selectClass}>
          <option value="">Selecione…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="text-fg-subtle text-xs">
          Ele entra já com todos os itens da rodada, e o link vai para o contato
          principal.
        </p>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex justify-end">
        <Submit label="Adicionar fornecedor" />
      </div>
    </form>
  );
}

/**
 * Iniciar a rodada.
 *
 * Confirma antes porque a interface não tem caminho de volta: iniciada, a
 * montagem se encerra e a edição passa a ser controlada (documento mestre,
 * 6.4). O painel diz o que vai acontecer em vez de perguntar "tem certeza?",
 * que é a pergunta que ninguém lê.
 *
 * O erro aparece aqui, ao lado do botão. Antes a action lançava, e a mensagem
 * "adicione ao menos um produto" chegava como página de erro.
 */
export function ActivateRoundForm({
  roundId,
  itemCount,
  supplierCount,
}: {
  roundId: string;
  itemCount: number;
  supplierCount: number;
}) {
  const [confirmando, setConfirmando] = React.useState(false);
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    activateRound,
    { error: null },
  );

  if (!confirmando) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => setConfirmando(true)}
        >
          <Play className="size-3.5" aria-hidden /> Iniciar rodada
        </Button>
        <ErrorLine error={state.error} />
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div>
        <h2 className="text-fg text-sm font-semibold">Iniciar a rodada</h2>
        <p className="text-fg-muted mt-1 text-sm">
          {itemCount} {itemCount === 1 ? "produto" : "produtos"} e{" "}
          {supplierCount}{" "}
          {supplierCount === 1 ? "fornecedor" : "fornecedores"} entram na
          cotação. Depois disso a montagem se encerra: acrescentar item ou
          fornecedor passa a ser alteração controlada.
        </p>
        <p className="text-fg-subtle mt-1 text-xs">
          Iniciar não envia nada. O link de cada fornecedor continua sendo um
          passo separado.
        </p>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Submit label="Iniciar rodada" />
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
