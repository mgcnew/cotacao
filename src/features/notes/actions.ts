"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  NOTE_LABELS,
  NOTE_LINK_KINDS,
  parseChecklist,
} from "@/features/notes/labels";
import { requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type NoteFormState = {
  error: string | null;
  savedAt?: number;
  respondedAt?: number;
  /** O que foi digitado, para o formulário não perder tudo num erro. */
  values?: { title: string; body: string; dueDate: string };
};

const PATH = "/anotacoes";

const opcional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .optional()
    .transform((value) => (value ? value : null));

const noteSchema = z
  .object({
    title: opcional(120, "Título muito longo"),
    body: opcional(5000, "Texto muito longo"),
    label: z
      .enum(NOTE_LABELS)
      .optional()
      .or(z.literal("").transform(() => undefined))
      .transform((value) => value ?? null),
    dueDate: z
      .string()
      .optional()
      .transform((value) => value || null)
      .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
        error: "Data do lembrete inválida",
      }),
    linkKind: z
      .enum(NOTE_LINK_KINDS)
      .optional()
      .or(z.literal("").transform(() => undefined))
      .transform((value) => value ?? null),
    linkId: z
      .string()
      .optional()
      .transform((value) => value || null)
      .refine((value) => value === null || z.uuid().safeParse(value).success, {
        error: "Vínculo inválido",
      }),
    checklist: z.string().optional(),
  })
  .transform((data) => {
    let raw: unknown = [];
    try {
      raw = JSON.parse(data.checklist || "[]");
    } catch {
      raw = [];
    }
    // Item novo chega sem id; o id é o que permite marcar um item só depois.
    const withIds = Array.isArray(raw)
      ? raw.map((item) =>
          item && typeof item === "object"
            ? {
                ...(item as Record<string, unknown>),
                id:
                  typeof (item as Record<string, unknown>).id === "string"
                    ? (item as Record<string, unknown>).id
                    : crypto.randomUUID(),
              }
            : item,
        )
      : [];
    return {
      ...data,
      // Vínculo pela metade não vale: tipo sem alvo ou alvo sem tipo.
      linkKind: data.linkKind && data.linkId ? data.linkKind : null,
      linkId: data.linkKind && data.linkId ? data.linkId : null,
      checklist: parseChecklist(withIds).slice(0, 50),
    };
  })
  .refine(
    (data) => data.title || data.body || data.checklist.length > 0,
    { error: "Escreva um título, um texto ou ao menos um item." },
  );

function describeError(error: { code?: string; message: string }): string {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "Esta anotação não é sua ou você não está nesta empresa.";
  }
  if (error.code === "42P01" || error.message.includes("personal_notes")) {
    return "Falta aplicar a migration 0119 no banco para usar as anotações.";
  }
  return `Não foi possível salvar: ${error.message}`;
}

/** Cria (sem `noteId`) ou edita uma anotação. */
export async function saveNote(
  noteId: string | null,
  _previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const company = await requireActiveCompany();
  const values = {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
  };
  const parsed = noteSchema.safeParse({
    title: formData.get("title") ?? undefined,
    body: formData.get("body") ?? undefined,
    label: formData.get("label") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
    linkKind: formData.get("linkKind") ?? undefined,
    linkId: formData.get("linkId") ?? undefined,
    checklist: formData.get("checklist") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0].message,
      respondedAt: Date.now(),
      values,
    };
  }
  if (noteId && !z.uuid().safeParse(noteId).success) {
    return { error: "Anotação inválida.", respondedAt: Date.now(), values };
  }

  const fields = {
    title: parsed.data.title,
    body: parsed.data.body,
    label: parsed.data.label,
    due_date: parsed.data.dueDate,
    link_kind: parsed.data.linkKind,
    link_id: parsed.data.linkId,
    checklist: parsed.data.checklist as unknown as Json,
  };

  const supabase = await createServerSupabaseClient();
  const { error } = noteId
    ? await supabase
        .from("personal_notes")
        .update(fields)
        .eq("company_id", company.companyId)
        .eq("id", noteId)
    : await supabase
        .from("personal_notes")
        .insert({ company_id: company.companyId, ...fields });
  if (error)
    return { error: describeError(error), respondedAt: Date.now(), values };

  revalidatePath(PATH);
  return { error: null, savedAt: Date.now(), respondedAt: Date.now() };
}

async function readNote(noteId: string) {
  const company = await requireActiveCompany();
  if (!z.uuid().safeParse(noteId).success) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("personal_notes")
    .select("id, pinned, done_at, checklist")
    .eq("company_id", company.companyId)
    .eq("id", noteId)
    .maybeSingle();
  return data ? { supabase, companyId: company.companyId, note: data } : null;
}

export async function toggleNotePinned(noteId: string) {
  const found = await readNote(noteId);
  if (!found) return;
  await found.supabase
    .from("personal_notes")
    .update({ pinned: !found.note.pinned })
    .eq("company_id", found.companyId)
    .eq("id", noteId);
  revalidatePath(PATH);
}

export async function toggleNoteDone(noteId: string) {
  const found = await readNote(noteId);
  if (!found) return;
  await found.supabase
    .from("personal_notes")
    .update({
      done_at: found.note.done_at ? null : new Date().toISOString(),
      // Concluída não fica presa no topo.
      pinned: found.note.done_at ? found.note.pinned : false,
    })
    .eq("company_id", found.companyId)
    .eq("id", noteId);
  revalidatePath(PATH);
}

export async function toggleChecklistItem(noteId: string, itemId: string) {
  const found = await readNote(noteId);
  if (!found) return;
  const checklist = parseChecklist(found.note.checklist).map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item,
  );
  await found.supabase
    .from("personal_notes")
    .update({ checklist: checklist as unknown as Json })
    .eq("company_id", found.companyId)
    .eq("id", noteId);
  revalidatePath(PATH);
}

export async function deleteNote(noteId: string) {
  const found = await readNote(noteId);
  if (!found) return;
  await found.supabase
    .from("personal_notes")
    .delete()
    .eq("company_id", found.companyId)
    .eq("id", noteId);
  revalidatePath(PATH);
}
