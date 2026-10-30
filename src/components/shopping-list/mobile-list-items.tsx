"use client";

import { MessageSquareText, Sparkles, UserRound } from "lucide-react";
import * as React from "react";

import { QuantityStepper } from "@/components/shopping-list/mobile-quick-add";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  refreshShoppingList,
  removeShoppingListItem,
  setShoppingListItemQuantity,
  updateShoppingListItem,
} from "@/features/shopping-list/actions";
import { cn } from "@/lib/utils";

export type MobileListItem = {
  id: string;
  productId: string;
  name: string;
  origin: "assistant" | "manual";
  createdLabel: string;
  quantity: number;
  unit: string;
  notes: string;
};

/** Pausa antes de salvar: três toques em + viram uma chamada só. */
const SAVE_DELAY_MS = 350;

function NotesDialog({
  item,
  quantity,
  open,
  onOpenChange,
}: {
  item: MobileListItem;
  quantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="flex min-h-0 flex-1 flex-col"
          action={async (formData) => {
            await updateShoppingListItem(formData);
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Observação</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {item.name}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="quantity" value={quantity} />
            <Input
              name="notes"
              defaultValue={item.notes}
              maxLength={300}
              autoFocus
              aria-label="Observação"
              placeholder="Estoque crítico, para sexta…"
              className="h-12 text-base"
            />
          </DialogBody>
          <DialogFooter>
            <Button type="submit" size="lg" className="h-12 w-full text-base">
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({
  item,
  canManage,
}: {
  item: MobileListItem;
  canManage: boolean;
}) {
  const [quantity, setQuantity] = React.useState(item.quantity);
  const [gone, setGone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const quantityRef = React.useRef(item.quantity);
  const confirmedRef = React.useRef(item.quantity);
  const timerRef = React.useRef<number | null>(null);

  const save = React.useCallback(async () => {
    timerRef.current = null;
    const wanted = quantityRef.current;
    let failure: string | null = null;
    try {
      const result = await setShoppingListItemQuantity(item.productId, wanted);
      if (result.error) failure = result.error;
      else confirmedRef.current = wanted;
    } catch {
      failure = "Sem conexão com o servidor. A quantidade não foi salva.";
    }
    if (failure) {
      if (timerRef.current === null) {
        quantityRef.current = confirmedRef.current;
        setQuantity(confirmedRef.current);
      }
      setError(failure);
      return;
    }
    // A Central e a lista dependem do número: atualiza quando a pausa acaba.
    if (timerRef.current === null) await refreshShoppingList();
  }, [item.productId]);

  // Sair da tela dentro da pausa não pode perder o último toque.
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        void save();
      }
    };
  }, [save]);

  async function remove() {
    setGone(true);
    try {
      await removeShoppingListItem(item.id);
    } catch {
      setGone(false);
      setError("Não foi possível remover. Tente de novo.");
    }
  }

  function step(delta: 1 | -1) {
    const next = Math.max(
      0,
      Math.round((quantityRef.current + delta) * 1000) / 1000,
    );
    change(next);
  }

  function change(next: number) {
    setError(null);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (next === 0) {
      void remove();
      return;
    }
    quantityRef.current = next;
    setQuantity(next);
    timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  if (gone) return null;

  return (
    <li className="border-border border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-fg line-clamp-2 text-sm leading-snug font-semibold">
            {item.name}
          </p>
          <p className="text-fg-subtle mt-0.5 flex items-center gap-1.5 text-xs">
            {item.origin === "assistant" ? (
              <>
                <Sparkles className="text-primary size-3 shrink-0" aria-hidden />
                <span className="sr-only">Assistente, </span>
              </>
            ) : (
              <>
                <UserRound className="size-3 shrink-0" aria-hidden />
                <span className="sr-only">Inserido por você, </span>
              </>
            )}
            <span className="truncate">
              {item.unit ? `${item.unit} · ` : ""}
              {item.createdLabel}
            </span>
          </p>
        </div>
        {canManage ? (
          <QuantityStepper
            name={item.name}
            value={quantity}
            onChange={change}
            onStep={step}
          />
        ) : (
          <p className="text-fg shrink-0 text-sm font-semibold tabular-nums">
            {String(quantity).replace(".", ",")} {item.unit}
          </p>
        )}
      </div>
      {canManage ? (
        <>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className={cn(
              "mt-1.5 flex max-w-full items-center gap-1.5 text-left text-xs",
              item.notes ? "text-fg-muted" : "text-primary",
            )}
          >
            <MessageSquareText className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {item.notes || "Adicionar observação"}
            </span>
          </button>
          <NotesDialog
            item={item}
            quantity={quantity}
            open={notesOpen}
            onOpenChange={setNotesOpen}
          />
        </>
      ) : item.notes ? (
        <p className="text-fg-muted mt-1.5 text-xs">{item.notes}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive mt-1.5 text-xs">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Itens da lista no celular, em linhas.
 *
 * Cada item era um cartão de ~200px (nome, quantidade, observação, Salvar,
 * lixeira): treze itens eram seis telas de rolagem. Aqui o item ocupa uma linha
 * e meia: nome e origem à esquerda, o passo de quantidade à direita (no 1, o −
 * vira a lixeira) e a observação, que raramente muda, atrás de um toque. A
 * quantidade salva sozinha, sem botão.
 *
 * `key` leva a quantidade do servidor: quando a página atualiza, a linha
 * recomeça do valor confirmado em vez de guardar um rascunho velho.
 */
export function MobileListItems({
  items,
  canManage,
}: {
  items: MobileListItem[];
  canManage: boolean;
}) {
  return (
    <ul className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs sm:hidden">
      {items.map((item) => (
        <ItemRow
          key={`${item.id}:${item.quantity}:${item.notes}`}
          item={item}
          canManage={canManage}
        />
      ))}
    </ul>
  );
}
