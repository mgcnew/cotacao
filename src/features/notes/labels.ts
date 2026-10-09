/**
 * Etiquetas e vínculos das anotações pessoais.
 *
 * As listas espelham os CHECKs de `personal_notes` (0119). Ficam num módulo
 * só, sem `server-only`, porque o formulário e a página usam as mesmas.
 */

export const NOTE_LABELS = [
  "negociacao",
  "pendencia",
  "conferir",
  "ideia",
  "importante",
] as const;

export type NoteLabel = (typeof NOTE_LABELS)[number];

export const NOTE_LABEL_TEXT: Record<NoteLabel, string> = {
  negociacao: "Negociação",
  pendencia: "Pendência",
  conferir: "Conferir",
  ideia: "Ideia",
  importante: "Importante",
};

/**
 * A cor de cada etiqueta, dos tokens do tema — funcionam no claro e no escuro.
 * `dot` é o ponto do seletor; `chip`, o selo no cartão; `bar`, a faixa lateral.
 */
export const NOTE_LABEL_STYLE: Record<
  NoteLabel,
  { dot: string; chip: string; bar: string }
> = {
  negociacao: {
    dot: "bg-primary",
    chip: "bg-primary-soft text-primary border-primary/30",
    bar: "bg-primary",
  },
  pendencia: {
    dot: "bg-warning",
    chip: "bg-warning-soft text-warning border-warning/30",
    bar: "bg-warning",
  },
  conferir: {
    dot: "bg-success",
    chip: "bg-success-soft text-success border-success/30",
    bar: "bg-success",
  },
  ideia: {
    dot: "bg-info",
    chip: "bg-info-soft text-info border-info/30",
    bar: "bg-info",
  },
  importante: {
    dot: "bg-destructive",
    chip: "bg-destructive-soft text-destructive border-destructive/30",
    bar: "bg-destructive",
  },
};

export function isNoteLabel(value: unknown): value is NoteLabel {
  return (
    typeof value === "string" &&
    (NOTE_LABELS as readonly string[]).includes(value)
  );
}

export const NOTE_LINK_KINDS = ["supplier", "product", "order", "round"] as const;

export type NoteLinkKind = (typeof NOTE_LINK_KINDS)[number];

export const NOTE_LINK_KIND_TEXT: Record<NoteLinkKind, string> = {
  supplier: "Fornecedor",
  product: "Produto",
  order: "Pedido",
  round: "Rodada de compra",
};

export function isNoteLinkKind(value: unknown): value is NoteLinkKind {
  return (
    typeof value === "string" &&
    (NOTE_LINK_KINDS as readonly string[]).includes(value)
  );
}

/** Para onde o vínculo leva. */
export function noteLinkHref(kind: NoteLinkKind, id: string): string {
  switch (kind) {
    case "supplier":
      return `/fornecedores/${id}`;
    case "product":
      return `/produtos/historico/${id}`;
    case "order":
      return `/pedidos/${id}`;
    case "round":
      return `/compras/${id}`;
  }
}

export type ChecklistItem = { id: string; text: string; done: boolean };

/** Lê o checklist vindo do banco, descartando o que não tem forma de item. */
export function parseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text || typeof item.id !== "string") return [];
    return [{ id: item.id, text: text.slice(0, 200), done: item.done === true }];
  });
}
