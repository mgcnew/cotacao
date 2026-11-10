/**
 * A contagem em texto, do jeito que vai para o WhatsApp de quem confere.
 *
 * Módulo comum, sem `server-only`: a tela monta a mensagem com o que tem em
 * mãos (inclusive lançamentos que acabaram de sair), sem ida ao servidor.
 *
 * Agrupa por categoria e ordena por nome, que é como se procura o item no
 * sistema na hora de bater. Cada produto tem o próprio total — não há soma
 * entre produtos diferentes, porque "31 un + 2 fardos" não é número nenhum.
 */

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export type CountMessageItem = {
  name: string;
  category: string;
  unit: string;
  entries: { quantity: number; location: string | null }[];
};

export function formatCountQuantity(value: number) {
  return QTY.format(value);
}

export function itemTotal(entries: { quantity: number }[]) {
  // Arredonda no fim: 0,1 + 0,2 não pode virar 0,30000000000000004.
  return Math.round(entries.reduce((sum, e) => sum + e.quantity, 0) * 1000) / 1000;
}

/**
 * A ordem da lista, na tela e no link: marcados para recontar no topo, depois
 * os contados por último — quem reconta acha logo o que acabou de mexer.
 */
export function sortCountItems<
  T extends {
    name: string;
    needsRecount: boolean;
    entries: { createdAt: string }[];
  },
>(items: T[]) {
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const lastCounted = (item: T) =>
    item.entries.reduce(
      (last, entry) => (entry.createdAt > last ? entry.createdAt : last),
      "",
    );
  return [...items].sort(
    (a, b) =>
      Number(b.needsRecount) - Number(a.needsRecount) ||
      (a.needsRecount ? 0 : lastCounted(b).localeCompare(lastCounted(a))) ||
      collator.compare(a.name, b.name),
  );
}

/** "Geladeira 7 + Estoque 24": lançamentos do mesmo local somam num só. */
export function describeLocations(
  entries: { quantity: number; location: string | null }[],
) {
  const byLocation = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.location?.trim() || "Sem local";
    byLocation.set(key, (byLocation.get(key) ?? 0) + entry.quantity);
  }
  return [...byLocation].map(
    ([location, quantity]) =>
      `${location} ${QTY.format(Math.round(quantity * 1000) / 1000)}`,
  );
}

export function buildCountMessage({
  title,
  dateLabel,
  author,
  items,
  link,
}: {
  title: string;
  dateLabel: string;
  author: string | null;
  items: CountMessageItem[];
  /** Link público da lista, para quem confere abrir com os locais e a ordem. */
  link?: string | null;
}) {
  const counted = items.filter((item) => item.entries.length > 0);
  const byCategory = new Map<string, CountMessageItem[]>();
  for (const item of counted) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const sections = [...byCategory]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([category, list]) => {
      const lines = list
        .sort((a, b) => collator.compare(a.name, b.name))
        // Só o total, em negrito e depois do nome. Os locais ficam na tela:
        // na conferência, "Geladeira 7 + Estoque 24" ao lado do 31 era mais
        // um número para ler errado.
        .map(
          (item) =>
            `• ${item.name}: *${QTY.format(itemTotal(item.entries))} ${item.unit}*`,
        );
      return [`*${category}*`, ...lines].join("\n");
    });

  return [
    `*Contagem de estoque — ${title}*`,
    author ? `${dateLabel} · contado por ${author}` : dateLabel,
    "",
    sections.join("\n\n"),
    "",
    counted.length === 1 ? "1 produto contado" : `${counted.length} produtos contados`,
    ...(link ? ["", `Lista completa: ${link}`] : []),
  ].join("\n");
}
