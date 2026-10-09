"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { deleteNote } from "@/features/notes/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      disabled={pending}
      className="text-fg-subtle hover:text-destructive h-7 gap-1 px-2 text-xs"
    >
      <Trash2 className="size-3" aria-hidden />
      {pending ? "Excluindo…" : "Excluir"}
    </Button>
  );
}

/**
 * Excluir é para sempre — anotação pessoal não tem lixeira. Por isso a
 * confirmação; quem só terminou o assunto tem "Concluir", que guarda.
 */
export function DeleteNoteButton({ noteId }: { noteId: string }) {
  return (
    <form
      action={deleteNote.bind(null, noteId)}
      className="ml-auto"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Excluir esta anotação? Não dá para desfazer. Para só tirar da frente, use Concluir.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <Submit />
    </form>
  );
}
