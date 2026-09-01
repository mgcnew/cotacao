"use client";

import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__cotacao_empty_value__";

export type ThemedSelectOption = {
  value: string;
  label: string;
};

export function ThemedSelect({
  id,
  name,
  form,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Selecione…",
  emptyOptionLabel,
  ariaLabel,
  required = false,
  disabled = false,
  className,
}: {
  id: string;
  name?: string;
  form?: string;
  options: ThemedSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyOptionLabel?: string;
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const current = controlled ? value : internalValue;

  return (
    <SelectPrimitive.Root
      value={current}
      disabled={disabled}
      onValueChange={(next) => {
        const actual = next === EMPTY_VALUE ? "" : next;
        if (!controlled) setInternalValue(actual);
        onValueChange?.(actual);
      }}
    >
      {name ? (
        <input type="hidden" name={name} value={current} form={form} />
      ) : null}
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-required={required}
        className={cn(
          "border-input bg-transparent text-fg shadow-xs transition-colors",
          "focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80",
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder={placeholder}
          className="min-w-0 flex-1 truncate text-left"
        />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="text-fg-subtle size-4 shrink-0" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "border-border bg-popover text-popover-foreground z-[100] min-w-[var(--radix-select-trigger-width)] max-w-[min(28rem,calc(100vw-1rem))] overflow-hidden rounded-lg border shadow-lg",
            "data-[state=open]:animate-ds-in data-[state=closed]:animate-ds-out",
          )}
        >
          <SelectPrimitive.ScrollUpButton className="bg-popover text-fg-muted flex h-7 items-center justify-center">
            <ChevronUp className="size-4" aria-hidden />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="max-h-[min(18rem,var(--radix-select-content-available-height))] p-1">
            {emptyOptionLabel ? (
              <SelectItem value={EMPTY_VALUE}>{emptyOptionLabel}</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="bg-popover text-fg-muted flex h-7 items-center justify-center">
            <ChevronDown className="size-4" aria-hidden />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "text-fg relative flex min-h-8 cursor-pointer select-none items-center rounded-md py-1.5 pr-3 pl-8 text-sm outline-none",
        "focus:bg-primary-soft data-[state=checked]:bg-primary-soft data-[state=checked]:font-medium",
      )}
    >
      <span className="text-primary absolute left-2 grid size-4 place-items-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3.5" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className="truncate">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
