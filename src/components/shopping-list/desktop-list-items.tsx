"use client";

import { Check, Loader2, Sparkles, Trash2, UserRound } from "lucide-react";
import * as React from "react";

import type { MobileListItem } from "@/components/shopping-list/mobile-list-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  removeShoppingListItem,
  updateShoppingListItem,
} from "@/features/shopping-list/actions";

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_9rem_minmax(12rem,0.8fr)_2.25rem] items-center gap-3 px-3";

type Status = "idle" | "saving" | "saved";

function formatQuantity(value: number) {
  return String(value).replace(".", ",");
}

/** Mesma leitura do formulário de adicionar: "1.200,5" e "3,5" valem. */
function parseQuantity(text: string) {
  const value = Number(text.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function ItemRow({ item }: { item: MobileListItem }) {
  const quantityRef = React.useRef<HTMLInputElement>(null);
  const notesRef = React.useRef<HTMLInputElement>(null);
  const savedRef = React.useRef({
    quantity: formatQuantity(item.quantity),
    notes: item.notes,
  });
  const clearTimer = React.useRef<number | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [gone, setGone] = React.useState(false);

  React.useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  /** Ao sair de um dos dois campos: salva só o que mudou. */
  async function save() {
    const quantityText = quantityRef.current?.value ?? "";
    const notes = (notesRef.current?.value ?? "").trim();
    const saved = savedRef.current;
    if (quantityText.trim() === saved.quantity && notes === saved.notes) return;

    if (parseQuantity(quantityText) === null) {
      setError("Quantidade deve ser maior que zero.");
      return;
    }

    setError(null);
    setStatus("saving");
    const formData = new FormData();
    formData.set("itemId", item.id);
    formData.set("quantity", quantityText.trim());
    formData.set("notes", notes);
    try {
      await updateShoppingListItem(formData);
      savedRef.current = { quantity: quantityText.trim(), notes };
      setStatus("saved");
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("idle");
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  async function remove() {
    setGone(true);
    try {
      await removeShoppingListItem(item.id);
    } catch {
      setGone(false);
      setError("Não foi possível remover. Tente de novo.");
    }
  }

  if (gone) return null;

  const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

  return (
    <li className="border-border hover:bg-surface-muted/40 border-b py-2 last:border-b-0">
      <div className={COLUMNS}>
        <div className="min-w-0">
          <p className="text-fg truncate text-sm font-medium">{item.name}</p>
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
            <span className="truncate">{item.createdLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            ref={quantityRef}
            aria-label={`Quantidade de ${item.name}`}
            defaultValue={formatQuantity(item.quantity)}
            inputMode="decimal"
            onBlur={() => void save()}
            onKeyDown={commitOnEnter}
            aria-invalid={error?.startsWith("Quantidade") || undefined}
            className="h-8 min-w-0 text-sm tabular-nums"
          />
          <span className="text-fg-subtle w-6 shrink-0 text-xs">{item.unit}</span>
        </div>
        <div className="relative min-w-0">
          <Input
            ref={notesRef}
            aria-label={`Observação de ${item.name}`}
            defaultValue={item.notes}
            maxLength={300}
            placeholder="Observação"
            onBlur={() => void save()}
            onKeyDown={commitOnEnter}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center justify-end">
          {status === "idle" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-fg-subtle hover:text-destructive"
              aria-label={`Remover ${item.name}`}
              onClick={() => void remove()}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          ) : status === "saving" ? (
            <Loader2
              className="text-fg-subtle size-4 animate-spin"
              aria-label="Salvando"
            />
          ) : (
            <Check className="text-success size-4" aria-label="Salvo" />
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-destructive px-3 pt-1 text-xs">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Itens da lista no desktop: uma linha por item, com os rótulos das colunas uma
 * vez só no alto.
 *
 * Antes cada item levava "Quantidade" e "Observação" escritos de novo, a data e
 * a etiqueta de origem em três linhas e um botão Salvar: ~80px por item, sete
 * itens por tela. Agora são ~52px, e quantidade e observação salvam ao sair do
 * campo ou no Enter — o ícone no fim da linha confirma. Quem não pode gerenciar
 * a lista vê o texto, sem campos.
 */
export function DesktopListItems({
  items,
  canManage,
}: {
  items: MobileListItem[];
  canManage: boolean;
}) {
  return (
    <div className="hidden sm:block">
      <div
        aria-hidden
        className={`${COLUMNS} text-fg-muted bg-surface sticky top-0 z-10 border-border border-b py-2 text-xs font-medium`}
      >
        <span>Produto</span>
        <span>Quantidade</span>
        <span>Observação</span>
        <span />
      </div>
      <ul>
        {items.map((item) =>
          canManage ? (
            <ItemRow key={item.id} item={item} />
          ) : (
            <li
              key={item.id}
              className={`${COLUMNS} border-border border-b py-2 text-sm last:border-b-0`}
            >
              <span className="text-fg truncate font-medium">{item.name}</span>
              <span className="tabular-nums">
                {formatQuantity(item.quantity)} {item.unit}
              </span>
              <span className="text-fg-muted truncate">{item.notes}</span>
              <span />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
