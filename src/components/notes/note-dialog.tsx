"use client";

import { ListPlus, Pencil, Plus, X } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { useFechaAoSalvar } from "@/components/layout/fecha-ao-salvar";
import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useFormularioSujo,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import { saveNote, type NoteFormState } from "@/features/notes/actions";
import {
  NOTE_LABEL_STYLE,
  NOTE_LABEL_TEXT,
  NOTE_LABELS,
  NOTE_LINK_KIND_TEXT,
  NOTE_LINK_KINDS,
  type ChecklistItem,
  type NoteLabel,
  type NoteLinkKind,
} from "@/features/notes/labels";
import { cn } from "@/lib/utils";

const fieldClass =
  "border-input bg-background text-fg focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3";

export type EditableNote = {
  id: string;
  title: string | null;
  body: string | null;
  label: NoteLabel | null;
  dueDate: string | null;
  checklist: ChecklistItem[];
  link: { kind: NoteLinkKind; id: string } | null;
};

export type LinkOptions = Record<
  NoteLinkKind,
  { id: string; name: string; description?: string }[]
>;

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : editing ? "Salvar" : "Criar anotação"}
    </Button>
  );
}

/**
 * Criar e editar uma anotação pessoal.
 *
 * Tudo opcional menos o conteúdo: título, texto ou ao menos um item de
 * checklist. Etiqueta, lembrete e vínculo existem para quem quiser, sem
 * obrigar ninguém a classificar um lembrete rápido.
 */
export function NoteDialog({
  note,
  linkOptions,
  defaultLink = null,
}: {
  note?: EditableNote;
  linkOptions: LinkOptions;
  /** Vínculo já escolhido ao abrir uma anotação nova (ex.: vinda do pedido). */
  defaultLink?: { kind: NoteLinkKind; id: string } | null;
}) {
  const action = saveNote.bind(null, note?.id ?? null);
  const [state, formAction] = useActionState<NoteFormState, FormData>(action, {
    error: null,
  });
  const [open, setOpen] = useFechaAoSalvar(state.savedAt);
  const { sujo, marcarSujo, limpar } = useFormularioSujo();
  const prefix = note ? `note-${note.id}-` : "new-note-";

  const inicialLink = note?.link ?? defaultLink;
  const [label, setLabel] = React.useState<NoteLabel | "">(note?.label ?? "");
  const [linkKind, setLinkKind] = React.useState<NoteLinkKind | "">(
    inicialLink?.kind ?? "",
  );
  const [linkId, setLinkId] = React.useState(inicialLink?.id ?? "");
  const [items, setItems] = React.useState<ChecklistItem[]>(
    note?.checklist ?? [],
  );
  const [novoItem, setNovoItem] = React.useState("");

  // Reabrir uma anotação nova começa do zero; a editada volta ao que está salvo.
  function reiniciar() {
    setLabel(note?.label ?? "");
    setLinkKind(inicialLink?.kind ?? "");
    setLinkId(inicialLink?.id ?? "");
    setItems(note?.checklist ?? []);
    setNovoItem("");
  }

  function adicionarItem() {
    const text = novoItem.trim();
    if (!text || items.length >= 50) return;
    setItems((atual) => [
      ...atual,
      { id: crypto.randomUUID(), text: text.slice(0, 200), done: false },
    ]);
    setNovoItem("");
    marcarSujo();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          limpar();
          reiniciar();
        }
      }}
    >
      <DialogTrigger asChild>
        {note ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
          >
            <Pencil className="size-3" aria-hidden /> Editar
          </Button>
        ) : (
          <Button type="button" size="sm" className="gap-1.5">
            <Plus className="size-3.5" aria-hidden /> Nova anotação
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="md" impedirFechamentoAcidental={sujo}>
        <DialogHeader>
          <DialogTitle>{note ? "Editar anotação" : "Nova anotação"}</DialogTitle>
          <DialogDescription>
            Só você vê suas anotações. Para a equipe saber de um combinado,
            registre o aviso na ficha do fornecedor.
          </DialogDescription>
        </DialogHeader>

        <form
          key={state.respondedAt}
          action={formAction}
          onChange={marcarSujo}
          className="contents"
        >
          <input type="hidden" name="label" value={label} />
          <input type="hidden" name="linkKind" value={linkKind} />
          <input type="hidden" name="linkId" value={linkKind ? linkId : ""} />
          <input
            type="hidden"
            name="checklist"
            value={JSON.stringify(items)}
          />

          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${prefix}title`}
                className="text-fg text-sm font-medium"
              >
                Título <span className="text-fg-subtle">(opcional)</span>
              </label>
              <Input
                id={`${prefix}title`}
                name="title"
                defaultValue={state.values?.title ?? note?.title ?? ""}
                autoFocus={!note}
                maxLength={120}
                placeholder="Ex.: Pedir desconto na próxima cotação de embalagem"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${prefix}body`}
                className="text-fg text-sm font-medium"
              >
                Anotação
              </label>
              <textarea
                id={`${prefix}body`}
                name="body"
                defaultValue={state.values?.body ?? note?.body ?? ""}
                maxLength={5000}
                rows={5}
                className={`${fieldClass} resize-y`}
                placeholder="Escreva livremente."
              />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-fg mb-1.5 text-sm font-medium">
                Etiqueta
              </legend>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={label === ""}
                  onClick={() => {
                    setLabel("");
                    marcarSujo();
                  }}
                  className={cn(
                    "border-border rounded-full border px-3 py-1 text-xs",
                    label === ""
                      ? "bg-surface-sunken text-fg font-medium"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  Sem etiqueta
                </button>
                {NOTE_LABELS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={label === option}
                    onClick={() => {
                      setLabel(option);
                      marcarSujo();
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                      label === option
                        ? cn(NOTE_LABEL_STYLE[option].chip, "font-medium")
                        : "border-border text-fg-muted hover:text-fg",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        NOTE_LABEL_STYLE[option].dot,
                      )}
                    />
                    {NOTE_LABEL_TEXT[option]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <span className="text-fg text-sm font-medium">
                Checklist <span className="text-fg-subtle">(opcional)</span>
              </span>
              {items.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.done}
                        aria-label={`Marcar "${item.text}"`}
                        onChange={() => {
                          setItems((atual) =>
                            atual.map((current) =>
                              current.id === item.id
                                ? { ...current, done: !current.done }
                                : current,
                            ),
                          );
                        }}
                        className="size-4"
                      />
                      <Input
                        value={item.text}
                        aria-label="Texto do item"
                        maxLength={200}
                        onChange={(event) => {
                          const text = event.target.value;
                          setItems((atual) =>
                            atual.map((current) =>
                              current.id === item.id
                                ? { ...current, text }
                                : current,
                            ),
                          );
                        }}
                        className={cn(
                          "h-8 flex-1 text-sm",
                          item.done && "text-fg-subtle line-through",
                        )}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        aria-label={`Remover "${item.text}"`}
                        onClick={() => {
                          setItems((atual) =>
                            atual.filter((current) => current.id !== item.id),
                          );
                          marcarSujo();
                        }}
                      >
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-center gap-2">
                <Input
                  value={novoItem}
                  onChange={(event) => setNovoItem(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter adiciona o item em vez de enviar a anotação.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      adicionarItem();
                    }
                  }}
                  maxLength={200}
                  placeholder="Novo item e Enter"
                  aria-label="Novo item do checklist"
                  className="h-8 flex-1 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  onClick={adicionarItem}
                  disabled={!novoItem.trim()}
                >
                  <ListPlus className="size-3.5" aria-hidden /> Adicionar
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${prefix}dueDate`}
                  className="text-fg text-sm font-medium"
                >
                  Lembrete <span className="text-fg-subtle">(opcional)</span>
                </label>
                <DateTimePicker
                  id={`${prefix}dueDate`}
                  name="dueDate"
                  defaultValue={state.values?.dueDate ?? note?.dueDate ?? ""}
                  placeholder="Escolher data"
                  dateOnly
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${prefix}linkKind`}
                  className="text-fg text-sm font-medium"
                >
                  Vincular a <span className="text-fg-subtle">(opcional)</span>
                </label>
                <ThemedSelect
                  id={`${prefix}linkKind`}
                  value={linkKind}
                  onValueChange={(value) => {
                    setLinkKind(value as NoteLinkKind | "");
                    setLinkId("");
                    marcarSujo();
                  }}
                  placeholder="Nada"
                  emptyOptionLabel="Nada"
                  options={NOTE_LINK_KINDS.map((kind) => ({
                    value: kind,
                    label: NOTE_LINK_KIND_TEXT[kind],
                  }))}
                />
              </div>
            </div>

            {linkKind ? (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${prefix}linkTarget`}
                  className="text-fg text-sm font-medium"
                >
                  {NOTE_LINK_KIND_TEXT[linkKind]}
                </label>
                <SearchableSelect
                  key={linkKind}
                  id={`${prefix}linkTarget`}
                  name="linkTarget"
                  options={linkOptions[linkKind]}
                  value={linkId}
                  onValueChange={(value) => {
                    setLinkId(value);
                    marcarSujo();
                  }}
                  placeholder="Digite para procurar…"
                  emptyMessage="Nada encontrado."
                />
              </div>
            ) : null}

            <ErrorLine error={state.error} />
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" size="sm" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton editing={Boolean(note)} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
