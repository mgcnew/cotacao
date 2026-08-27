"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import { cn } from "@/lib/utils";

const MONTH = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const FULL_DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });
const WEEKDAYS = [
  { short: "S", full: "segunda-feira" },
  { short: "T", full: "terça-feira" },
  { short: "Q", full: "quarta-feira" },
  { short: "Q", full: "quinta-feira" },
  { short: "S", full: "sexta-feira" },
  { short: "S", full: "sábado" },
  { short: "D", full: "domingo" },
];
const HOURS = Array.from({ length: 24 }, (_, value) => ({
  value: String(value),
  label: String(value).padStart(2, "0"),
}));
const MINUTES = Array.from({ length: 60 }, (_, value) => ({
  value: String(value),
  label: String(value).padStart(2, "0"),
}));

function sameDay(left: Date | null, right: Date) {
  return (
    left?.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function daysForMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(
    first.getFullYear(),
    first.getMonth(),
    1 - mondayOffset,
  );
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}

function withDate(current: Date | null, day: Date) {
  const now = current ?? new Date();
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    now.getHours(),
    now.getMinutes(),
  );
}

function withTime(
  current: Date | null,
  part: "hour" | "minute",
  value: number,
) {
  const next = new Date(current ?? new Date());
  if (part === "hour") next.setHours(value);
  else next.setMinutes(value);
  next.setSeconds(0, 0);
  return next;
}

export function DateTimePicker({
  id,
  name,
  form,
  placeholder = "Escolher data e hora",
  defaultValue = "",
  dateOnly = false,
}: {
  id: string;
  name: string;
  form?: string;
  placeholder?: string;
  defaultValue?: string;
  dateOnly?: boolean;
}) {
  const initialDate = defaultValue
    ? new Date(dateOnly ? `${defaultValue}T12:00:00` : defaultValue)
    : null;
  const validInitialDate =
    initialDate && !Number.isNaN(initialDate.getTime()) ? initialDate : null;
  const [selected, setSelected] = React.useState<Date | null>(validInitialDate);
  const [visibleMonth, setVisibleMonth] = React.useState(() => {
    const base = validInitialDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const days = daysForMonth(visibleMonth);
  const today = new Date();

  function chooseDay(day: Date) {
    setSelected((current) => withDate(current, day));
    if (day.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }

  function chooseNow() {
    const now = new Date();
    now.setSeconds(0, 0);
    setSelected(now);
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  function chooseTime(part: "hour" | "minute", value: number) {
    const next = withTime(selected, part, value);
    setSelected(next);
    if (!selected) {
      setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }

  const selectedValue = selected
    ? dateOnly
      ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
      : selected.toISOString()
    : "";

  return (
    <PopoverPrimitive.Root>
      <input type="hidden" name={name} form={form} value={selectedValue} />
      <PopoverPrimitive.Trigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-8 w-full justify-start px-2.5 font-normal",
            !selected && "text-fg-subtle",
          )}
        >
          <CalendarDays className="size-4" aria-hidden />
          <span className="min-w-0 truncate">
            {selected
              ? dateOnly
                ? DATE.format(selected)
                : DATE_TIME.format(selected)
              : placeholder}
          </span>
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={5}
          collisionPadding={8}
          className="border-border bg-popover text-popover-foreground data-[state=open]:animate-ds-in z-[100] w-[min(20rem,calc(100vw-1rem))] rounded-xl border p-3 shadow-xl outline-none"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Mês anterior"
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft aria-hidden />
            </Button>
            <strong className="text-sm font-semibold capitalize">
              {MONTH.format(visibleMonth)}
            </strong>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Próximo mês"
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1" role="grid">
            {WEEKDAYS.map((weekday) => (
              <span
                key={weekday.full}
                title={weekday.full}
                className="text-fg-subtle grid h-7 place-items-center text-[11px] font-medium"
              >
                {weekday.short}
              </span>
            ))}
            {days.map((day) => {
              const chosen = sameDay(selected, day);
              const isToday = sameDay(today, day);
              const outside = day.getMonth() !== visibleMonth.getMonth();
              return (
                <button
                  key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                  type="button"
                  aria-label={FULL_DATE.format(day)}
                  aria-pressed={chosen}
                  onClick={() => chooseDay(day)}
                  className={cn(
                    "focus-visible:border-ring focus-visible:ring-ring/50 grid size-8 place-items-center rounded-lg border border-transparent text-xs outline-none transition-colors focus-visible:ring-3",
                    outside
                      ? "text-fg-subtle/55 hover:bg-surface-muted"
                      : "text-fg hover:bg-surface-muted",
                    isToday && !chosen && "border-primary/45 text-primary",
                    chosen &&
                      "bg-primary text-primary-foreground hover:bg-primary/85",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {!dateOnly ? (
            <div className="border-border mt-3 border-t pt-3">
              <p className="text-fg-muted mb-2 flex items-center gap-1.5 text-xs font-medium">
                <Clock3 className="size-3.5" aria-hidden /> Horário
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <ThemedSelect
                  id={`${id}-hour`}
                  value={String((selected ?? today).getHours())}
                  onValueChange={(value) => chooseTime("hour", Number(value))}
                  ariaLabel="Hora"
                  options={HOURS}
                />
                <span className="text-fg-muted">:</span>
                <ThemedSelect
                  id={`${id}-minute`}
                  value={String((selected ?? today).getMinutes())}
                  onValueChange={(value) => chooseTime("minute", Number(value))}
                  ariaLabel="Minuto"
                  options={MINUTES}
                />
              </div>
            </div>
          ) : null}

          <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!selected}
              onClick={() => setSelected(null)}
            >
              Limpar
            </Button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={chooseNow}
              >
                {dateOnly ? "Hoje" : "Agora"}
              </Button>
              <PopoverPrimitive.Close asChild>
                <Button type="button" size="sm">
                  Concluir
                </Button>
              </PopoverPrimitive.Close>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
