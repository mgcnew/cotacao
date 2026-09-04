"use client";

import { Search, X } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";
import { normalizeListSearch } from "@/lib/list-pagination";

export type SearchableOption = {
  id: string;
  name: string;
  description?: string;
};

export function SearchableSelect({
  id,
  name,
  options,
  placeholder = "Digite para buscar…",
  emptyMessage = "Nenhum resultado encontrado.",
  value,
  defaultValue = "",
  onValueChange,
  onOptionSelected,
  submitOnEnter = false,
  focusKey,
  required = false,
  className,
}: {
  id: string;
  name: string;
  options: SearchableOption[];
  placeholder?: string;
  emptyMessage?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onOptionSelected?: (option: SearchableOption) => void;
  /** Ao escolher a sugestão com Enter, envia o formulário que contém o campo. */
  submitOnEnter?: boolean;
  /** Quando muda após um salvamento, limpa o fluxo e devolve o foco ao campo. */
  focusKey?: string | number;
  required?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const selectedId = controlled ? value : internalValue;
  const initialOption = options.find((option) => option.id === selectedId);
  const [query, setQuery] = React.useState(initialOption?.name ?? "");
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const hiddenRef = React.useRef<HTMLInputElement>(null);
  const listId = `${id}-suggestions`;

  React.useEffect(() => {
    if (focusKey === undefined) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusKey]);

  const needle = normalizeListSearch(query);
  const suggestions = options
    .filter((option) =>
      normalizeListSearch(
        `${option.name} ${option.description ?? ""}`,
      ).includes(needle),
    )
    .slice(0, 8);
  const selected = options.find((option) => option.id === selectedId) ?? null;
  const showSuggestions = open && options.length > 0;

  function changeValue(nextValue: string) {
    if (!controlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function choose(option: SearchableOption, submit = false) {
    changeValue(option.id);
    // Mantém o valor do DOM sincronizado antes de um requestSubmit imediato.
    // O estado React confirma o mesmo valor no render seguinte.
    if (hiddenRef.current) hiddenRef.current.value = option.id;
    setQuery(option.name);
    setOpen(false);
    setActiveIndex(0);
    onOptionSelected?.(option);
    if (submit) {
      queueMicrotask(() => hiddenRef.current?.form?.requestSubmit());
    }
  }

  function clear() {
    changeValue("");
    setQuery("");
    setOpen(true);
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  return (
    <PopoverPrimitive.Root open={showSuggestions} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <input ref={hiddenRef} type="hidden" name={name} value={selectedId} />
        <PopoverPrimitive.Anchor asChild>
          <div className="relative">
            <Search
              className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              ref={inputRef}
              id={id}
              type="text"
              role="combobox"
              autoComplete="off"
              required={required}
              value={query}
              placeholder={placeholder}
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls={listId}
              aria-activedescendant={
                showSuggestions && suggestions[activeIndex]
                  ? `${id}-option-${suggestions[activeIndex].id}`
                  : undefined
              }
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                changeValue("");
                setOpen(true);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(true);
                  setActiveIndex((current) =>
                    Math.min(
                      current + 1,
                      Math.max(suggestions.length - 1, 0),
                    ),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter" && open) {
                  const option = suggestions[activeIndex];
                  if (!option) return;
                  event.preventDefault();
                  choose(option, submitOnEnter);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              className={cn(
                "border-input bg-surface text-fg placeholder:text-fg-subtle",
                "focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border pr-8 pl-8 text-sm outline-none focus-visible:ring-3",
              )}
            />
            {query || selected ? (
              <button
                type="button"
                aria-label="Limpar seleção"
                onClick={clear}
                className="text-fg-subtle hover:text-fg absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </PopoverPrimitive.Anchor>
      </div>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="border-border bg-popover text-popover-foreground data-[state=open]:animate-ds-in data-[state=closed]:animate-ds-out z-[100] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border shadow-xl outline-none"
        >
          <ul
            id={listId}
            role="listbox"
            aria-label="Sugestões"
            className="max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-y-auto"
          >
            {suggestions.map((option, index) => (
              <li key={option.id}>
                <button
                  type="button"
                  id={`${id}-option-${option.id}`}
                  role="option"
                  aria-selected={option.id === selectedId}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full flex-col px-3 py-2 text-left",
                    index === activeIndex
                      ? "bg-surface-muted"
                      : "bg-transparent",
                  )}
                >
                  <span className="text-fg text-sm">{option.name}</span>
                  {option.description ? (
                    <span className="text-fg-subtle text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {suggestions.length === 0 ? (
              <li className="text-fg-muted px-3 py-3 text-sm" role="status">
                {emptyMessage}
              </li>
            ) : null}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
