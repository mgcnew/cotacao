"use client";

import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  removeDemandCalendarEvent,
  saveDemandCalendarEvent,
  setDemandCalendarEventActive,
  type DemandCalendarState,
} from "@/features/demand-calendar/actions";
import {
  DEMAND_EVENT_TYPES,
  DEMAND_RECURRENCES,
  DEMAND_SCOPES,
  type DemandCalendarCategory,
  type DemandCalendarEvent,
  type DemandCalendarProduct,
  type DemandRecurrence,
  type DemandScope,
} from "@/features/demand-calendar/model";

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function typeLabel(value: string) {
  return (
    DEMAND_EVENT_TYPES.find((type) => type.value === value)?.label ?? value
  );
}

function scopeLabel(event: DemandCalendarEvent) {
  if (event.scope === "category")
    return `Categoria: ${event.categoryName ?? "—"}`;
  if (event.scope === "product") return `Produto: ${event.productName ?? "—"}`;
  return "Todos os produtos";
}

function recurrenceLabel(event: DemandCalendarEvent) {
  const label =
    DEMAND_RECURRENCES.find(
      (recurrence) => recurrence.value === event.recurrence,
    )?.label ?? event.recurrence;
  if (event.recurrence === "one_time") return label;
  if (!event.recurrenceUntil) return `${label}, sem data para terminar`;
  return `${label}, até ${DATE.format(new Date(`${event.recurrenceUntil}T12:00:00`))}`;
}

function EventForm({
  event,
  categories,
  products,
  onSaved,
}: {
  event: DemandCalendarEvent | null;
  categories: DemandCalendarCategory[];
  products: DemandCalendarProduct[];
  onSaved: () => void;
}) {
  const [scope, setScope] = React.useState<DemandScope>(event?.scope ?? "all");
  const [recurrence, setRecurrence] = React.useState<DemandRecurrence>(
    event?.recurrence ?? "one_time",
  );
  const [state, action, pending] = useActionState<
    DemandCalendarState,
    FormData
  >(
    async (previous, formData) => {
      const result = await saveDemandCalendarEvent(previous, formData);
      if (!result.error) onSaved();
      return result;
    },
    { error: null },
  );
  const formKey = event?.id ?? "new";

  return (
    <form id="demand-event-form" action={action} className="contents">
      <DialogBody className="grid content-start gap-4 sm:grid-cols-2">
        <input type="hidden" name="eventId" value={event?.id ?? ""} />
        <label className="text-fg-muted flex flex-col gap-1 text-xs sm:col-span-2">
          Nome do evento
          <Input
            name="name"
            defaultValue={event?.name ?? ""}
            placeholder="Ex.: feriado municipal ou semana de pagamento"
            maxLength={120}
            required
          />
        </label>

        <label className="text-fg-muted flex flex-col gap-1 text-xs">
          Tipo
          <ThemedSelect
            id={`demand-type-${formKey}`}
            name="eventType"
            defaultValue={event?.eventType ?? "holiday"}
            options={[...DEMAND_EVENT_TYPES]}
          />
        </label>
        <label className="text-fg-muted flex flex-col gap-1 text-xs">
          Impacto esperado
          <div className="relative">
            <Input
              name="adjustmentPercent"
              type="number"
              inputMode="decimal"
              min="-80"
              max="200"
              step="0.5"
              defaultValue={event?.adjustmentPercent ?? 10}
              className="pr-8"
              required
            />
            <span className="text-fg-subtle pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
              %
            </span>
          </div>
          <span className="text-fg-subtle">
            Positivo aumenta; negativo reduz.
          </span>
        </label>

        <label className="text-fg-muted flex flex-col gap-1 text-xs">
          Início
          <DateTimePicker
            key={`start-${formKey}`}
            id={`demand-start-${formKey}`}
            name="startDate"
            defaultValue={event?.startDate ?? ""}
            placeholder="Escolher data inicial"
            dateOnly
          />
        </label>
        <label className="text-fg-muted flex flex-col gap-1 text-xs">
          Fim
          <DateTimePicker
            key={`end-${formKey}`}
            id={`demand-end-${formKey}`}
            name="endDate"
            defaultValue={event?.endDate ?? ""}
            placeholder="Escolher data final"
            dateOnly
          />
        </label>

        <label className="text-fg-muted flex flex-col gap-1 text-xs">
          Repetição
          <ThemedSelect
            id={`demand-recurrence-${formKey}`}
            name="recurrence"
            value={recurrence}
            onValueChange={(value) => setRecurrence(value as DemandRecurrence)}
            options={[...DEMAND_RECURRENCES]}
          />
          <span className="text-fg-subtle">
            Repete o mesmo período e impacto.
          </span>
        </label>
        {recurrence === "one_time" ? (
          <input type="hidden" name="recurrenceUntil" value="" />
        ) : (
          <label className="text-fg-muted flex flex-col gap-1 text-xs">
            Repetir até <span className="text-fg-subtle">(opcional)</span>
            <DateTimePicker
              key={`recurrence-until-${formKey}`}
              id={`demand-recurrence-until-${formKey}`}
              name="recurrenceUntil"
              defaultValue={event?.recurrenceUntil ?? ""}
              placeholder="Sem data para terminar"
              dateOnly
            />
            <span className="text-fg-subtle">
              Em branco, continua por tempo indeterminado.
            </span>
          </label>
        )}

        <label className="text-fg-muted flex flex-col gap-1 text-xs sm:col-span-2">
          Aplicar a
          <ThemedSelect
            id={`demand-scope-${formKey}`}
            name="scope"
            value={scope}
            onValueChange={(value) => setScope(value as DemandScope)}
            options={[...DEMAND_SCOPES]}
          />
        </label>

        {scope === "category" ? (
          <label className="text-fg-muted flex flex-col gap-1 text-xs sm:col-span-2">
            Categoria
            <ThemedSelect
              id={`demand-category-${formKey}`}
              name="categoryId"
              defaultValue={event?.categoryId ?? ""}
              placeholder="Escolha a categoria"
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              required
            />
          </label>
        ) : (
          <input type="hidden" name="categoryId" value="" />
        )}

        {scope === "product" ? (
          <label className="text-fg-muted flex flex-col gap-1 text-xs sm:col-span-2">
            Produto
            <SearchableSelect
              id={`demand-product-${formKey}`}
              name="productId"
              defaultValue={event?.productId ?? ""}
              placeholder="Digite o nome do produto…"
              options={products.map((product) => ({
                id: product.id,
                name: product.name,
                description: product.categoryName,
              }))}
              required
            />
          </label>
        ) : (
          <input type="hidden" name="productId" value="" />
        )}

        <label className="text-fg-muted flex flex-col gap-1 text-xs sm:col-span-2">
          Observação <span className="text-fg-subtle">(opcional)</span>
          <textarea
            name="notes"
            defaultValue={event?.notes ?? ""}
            maxLength={500}
            rows={3}
            className="border-input bg-transparent text-fg placeholder:text-fg-subtle focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3 dark:bg-input/30"
            placeholder="Explique a razão do ajuste para facilitar a revisão."
          />
        </label>

        {state.error ? (
          <p className="text-destructive text-xs sm:col-span-2" role="alert">
            {state.error}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button type="submit" form="demand-event-form" disabled={pending}>
          {pending
            ? "Salvando..."
            : event
              ? "Salvar alterações"
              : "Criar evento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DemandCalendarManager({
  events,
  categories,
  products,
  canManage,
}: {
  events: DemandCalendarEvent[];
  categories: DemandCalendarCategory[];
  products: DemandCalendarProduct[];
  canManage: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DemandCalendarEvent | null>(
    null,
  );

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(event: DemandCalendarEvent) {
    setEditing(event);
    setOpen(true);
  }

  return (
    <div className="border-border bg-surface overflow-hidden rounded-xl border">
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-fg flex items-center gap-2 text-base font-semibold">
            <CalendarRange className="text-primary size-4" aria-hidden />
            Calendário de demanda
          </h2>
          <p className="text-fg-muted mt-1 max-w-3xl text-xs leading-relaxed">
            Registre acontecimentos conhecidos que alteram a necessidade normal.
            O percentual será mostrado separadamente da média histórica.
          </p>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={openNew}>
            <Plus aria-hidden /> Novo evento
          </Button>
        ) : null}
      </header>

      {events.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-fg text-sm font-medium">
            Nenhum evento cadastrado
          </p>
          <p className="text-fg-muted mt-1 text-xs">
            A média histórica continuará sendo usada sem qualquer ajuste
            externo.
          </p>
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {events.map((event) => (
            <li key={event.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-fg text-sm font-semibold">
                      {event.name}
                    </h3>
                    <span
                      className={
                        event.isActive
                          ? "bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          : "bg-surface-muted text-fg-subtle rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      }
                    >
                      {event.isActive ? "Ativo" : "Pausado"}
                    </span>
                    <span
                      className={
                        event.adjustmentPercent >= 0
                          ? "bg-primary-soft text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          : "bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      }
                    >
                      {event.adjustmentPercent > 0 ? "+" : ""}
                      {event.adjustmentPercent}%
                    </span>
                  </div>
                  <p className="text-fg-muted mt-1 text-xs">
                    {typeLabel(event.eventType)} · {scopeLabel(event)}
                  </p>
                  <p className="text-fg-subtle mt-1 text-[11px]">
                    {DATE.format(new Date(`${event.startDate}T12:00:00`))} até{" "}
                    {DATE.format(new Date(`${event.endDate}T12:00:00`))}
                  </p>
                  <p className="text-fg-subtle mt-1 text-[11px]">
                    {recurrenceLabel(event)}
                  </p>
                  {event.notes ? (
                    <p className="text-fg-muted mt-1 text-xs">{event.notes}</p>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(event)}
                    >
                      <Pencil aria-hidden /> Editar
                    </Button>
                    <form
                      action={setDemandCalendarEventActive.bind(
                        null,
                        event.id,
                        !event.isActive,
                      )}
                    >
                      <Button type="submit" size="sm" variant="ghost">
                        {event.isActive ? "Pausar" : "Reativar"}
                      </Button>
                    </form>
                    <form
                      action={removeDemandCalendarEvent.bind(null, event.id)}
                      onSubmit={(submitEvent) => {
                        if (
                          !window.confirm(
                            `Excluir o evento “${event.name}”? Esta ação não pode ser desfeita.`,
                          )
                        ) {
                          submitEvent.preventDefault();
                        }
                      }}
                    >
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`Excluir ${event.name}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" impedirFechamentoAcidental>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar evento de demanda" : "Novo evento de demanda"}
            </DialogTitle>
            <DialogDescription>
              Informe uma expectativa operacional. O histórico original sempre
              continuará visível para comparação.
            </DialogDescription>
          </DialogHeader>
          <EventForm
            key={editing?.id ?? "new"}
            event={editing}
            categories={categories}
            products={products}
            onSaved={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
