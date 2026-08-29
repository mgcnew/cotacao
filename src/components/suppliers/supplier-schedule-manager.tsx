"use client";

import {
  CalendarClock,
  PackagePlus,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  removeSupplierPurchaseScheduleItem,
  saveSupplierPurchaseSchedule,
  saveSupplierPurchaseScheduleItem,
  setSupplierPurchaseScheduleActive,
  type PurchaseScheduleState,
} from "@/features/suppliers/schedule-actions";
import {
  formatPurchaseWeekdays,
  PURCHASE_INTERVAL_LABEL,
  PURCHASE_WEEKDAYS,
  type ScheduleProductOption,
  type ScheduleTemplateItem,
  type SupplierPurchaseSchedule,
} from "@/features/suppliers/schedule-model";

type Category = { id: string; name: string };
type Product = ScheduleProductOption;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Salvar agenda"}
    </Button>
  );
}

function ScheduleForm({
  supplierId,
  categories,
  today,
  schedule,
}: {
  supplierId: string;
  categories: Category[];
  today: string;
  schedule?: SupplierPurchaseSchedule;
}) {
  const [state, action] = useActionState<PurchaseScheduleState, FormData>(
    saveSupplierPurchaseSchedule,
    { error: null },
  );
  const prefix = schedule ? `schedule-${schedule.id}` : "new-schedule";

  return (
    <form
      key={state.savedAt}
      action={action}
      className="border-border bg-surface-sunken flex flex-col gap-4 rounded-xl border p-4"
    >
      <input type="hidden" name="scheduleId" value={schedule?.id ?? ""} />
      <input type="hidden" name="supplierId" value={supplierId} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label
            htmlFor={`${prefix}-label`}
            className="text-fg text-sm font-medium"
          >
            Nome da rotina <span className="text-fg-subtle">(opcional)</span>
          </label>
          <Input
            id={`${prefix}-label`}
            name="label"
            defaultValue={schedule?.label ?? ""}
            maxLength={120}
            placeholder="Ex.: Pedido semanal de pães"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label
            htmlFor={`${prefix}-category`}
            className="text-fg text-sm font-medium"
          >
            Categoria <span className="text-fg-subtle">(opcional)</span>
          </label>
          <ThemedSelect
            id={`${prefix}-category`}
            name="categoryId"
            defaultValue={schedule?.categoryId ?? ""}
            emptyOptionLabel="Todas as compras deste fornecedor"
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
          <fieldset>
            <legend className="text-fg text-sm font-medium">
              Dias do pedido
            </legend>
            <p className="text-fg-subtle mt-0.5 text-xs">
              Marque todos os dias em que este fornecedor aceita pedidos.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {PURCHASE_WEEKDAYS.map((label, weekday) => (
                <label
                  key={label}
                  className="border-border bg-surface hover:border-primary/45 has-checked:border-primary has-checked:bg-primary-soft text-fg flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={weekday}
                    defaultChecked={
                      schedule
                        ? schedule.weekdays.includes(weekday)
                        : weekday === 1
                    }
                    className="accent-primary size-4 shrink-0"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${prefix}-frequency`}
            className="text-fg text-sm font-medium"
          >
            Frequência
          </label>
          <ThemedSelect
            id={`${prefix}-frequency`}
            name="intervalWeeks"
            required
            defaultValue={String(schedule?.intervalWeeks ?? 1)}
            options={[1, 2, 4].map((value) => ({
              value: String(value),
              label: PURCHASE_INTERVAL_LABEL[value],
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${prefix}-anchor`}
            className="text-fg text-sm font-medium"
          >
            Data-base do ciclo
          </label>
          <Input
            id={`${prefix}-anchor`}
            name="anchorDate"
            type="date"
            required
            defaultValue={schedule?.anchorDate ?? today}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${prefix}-time`}
            className="text-fg text-sm font-medium"
          >
            Horário limite <span className="text-fg-subtle">(opcional)</span>
          </label>
          <Input
            id={`${prefix}-time`}
            name="preferredTime"
            type="time"
            defaultValue={schedule?.preferredTime?.slice(0, 5) ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${prefix}-reminder`}
            className="text-fg text-sm font-medium"
          >
            Avisar com antecedência
          </label>
          <ThemedSelect
            id={`${prefix}-reminder`}
            name="reminderDaysBefore"
            required
            defaultValue={String(schedule?.reminderDaysBefore ?? 1)}
            options={[0, 1, 2, 3, 5, 7].map((value) => ({
              value: String(value),
              label:
                value === 0
                  ? "No próprio dia"
                  : `${value} ${value === 1 ? "dia antes" : "dias antes"}`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${prefix}-delivery`}
            className="text-fg text-sm font-medium"
          >
            Entrega após <span className="text-fg-subtle">(opcional)</span>
          </label>
          <div className="relative">
            <Input
              id={`${prefix}-delivery`}
              name="expectedDeliveryDays"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              defaultValue={schedule?.expectedDeliveryDays ?? ""}
              className="pr-12"
              placeholder="—"
            />
            <span className="text-fg-subtle pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
              dias
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label
            htmlFor={`${prefix}-notes`}
            className="text-fg text-sm font-medium"
          >
            Orientação <span className="text-fg-subtle">(opcional)</span>
          </label>
          <Input
            id={`${prefix}-notes`}
            name="notes"
            maxLength={500}
            defaultValue={schedule?.notes ?? ""}
            placeholder="Ex.: confirmar promoções antes de fechar"
          />
        </div>
      </div>

      <p className="text-fg-subtle text-xs">
        Em agendas quinzenais ou de quatro semanas, a data-base define quais
        semanas pertencem ao ciclo; todos os dias marcados valem nessas
        semanas.
      </p>
      <ErrorLine error={state.error} />
      <SuccessLine
        message={state.savedAt ? "Agenda salva com sucesso." : null}
      />
      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}

function ScheduleSummary({ schedule }: { schedule: SupplierPurchaseSchedule }) {
  const interval =
    PURCHASE_INTERVAL_LABEL[schedule.intervalWeeks] ??
    `A cada ${schedule.intervalWeeks} semanas`;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-fg font-medium">
          {schedule.label || schedule.supplierName}
        </p>
        <span
          className={
            schedule.isActive
              ? "bg-success-soft text-success rounded-full px-2 py-0.5 text-[11px] font-medium"
              : "bg-surface-muted text-fg-subtle rounded-full px-2 py-0.5 text-[11px] font-medium"
          }
        >
          {schedule.isActive ? "Ativa" : "Pausada"}
        </span>
      </div>
      <p className="text-fg-muted mt-0.5 text-sm">
        {interval} · {formatPurchaseWeekdays(schedule.weekdays)}
        {schedule.preferredTime
          ? ` até ${schedule.preferredTime.slice(0, 5)}`
          : ""}
        {schedule.categoryName ? ` · ${schedule.categoryName}` : ""}
      </p>
      <p className="text-fg-subtle mt-1 text-xs">
        Aviso{" "}
        {schedule.reminderDaysBefore === 0
          ? "no mesmo dia"
          : `${schedule.reminderDaysBefore} dia(s) antes`}
        {schedule.expectedDeliveryDays !== null
          ? ` · entrega habitual em ${schedule.expectedDeliveryDays} dia(s)`
          : ""}
      </p>
    </div>
  );
}

function ItemSaveButton({ newItem = false }: { newItem?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={newItem ? "default" : "outline"}
      disabled={pending}
    >
      {pending ? "Salvando…" : newItem ? "Adicionar produto" : "Salvar"}
    </Button>
  );
}

function NewTemplateItemForm({
  schedule,
  supplierId,
  products,
}: {
  schedule: SupplierPurchaseSchedule;
  supplierId: string;
  products: Product[];
}) {
  const [state, action] = useActionState<PurchaseScheduleState, FormData>(
    saveSupplierPurchaseScheduleItem,
    { error: null },
  );
  const quantityRef = React.useRef<HTMLInputElement>(null);
  const available = products.filter((product) => product.id && product.name);

  return (
    <form key={state.savedAt} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="itemId" value="" />
      <input type="hidden" name="scheduleId" value={schedule.id} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`template-product-${schedule.id}`}
            className="text-fg text-xs font-medium"
          >
            Produto
          </label>
          <SearchableSelect
            id={`template-product-${schedule.id}`}
            name="productId"
            required
            focusKey={state.savedAt}
            options={available.map((product) => ({
              id: product.id,
              name: product.name,
              description: product.purchaseUnit,
            }))}
            placeholder="Digite o nome do produto…"
            emptyMessage="Nenhum produto encontrado."
            onOptionSelected={() => quantityRef.current?.focus()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`template-quantity-${schedule.id}`}
            className="text-fg text-xs font-medium"
          >
            Quantidade habitual
          </label>
          <Input
            ref={quantityRef}
            id={`template-quantity-${schedule.id}`}
            name="quantity"
            required
            inputMode="decimal"
            placeholder="0"
          />
        </div>
      </div>
      <Input
        name="notes"
        maxLength={300}
        placeholder="Observação para este produto (opcional)"
      />
      <ErrorLine error={state.error} />
      <SuccessLine
        message={state.savedAt ? "Produto adicionado ao modelo." : null}
      />
      <div className="flex justify-end">
        <ItemSaveButton newItem />
      </div>
    </form>
  );
}

function ExistingTemplateItemForm({
  item,
  scheduleId,
  supplierId,
  canManage,
}: {
  item: ScheduleTemplateItem;
  scheduleId: string;
  supplierId: string;
  canManage: boolean;
}) {
  const [state, action] = useActionState<PurchaseScheduleState, FormData>(
    saveSupplierPurchaseScheduleItem,
    { error: null },
  );

  return (
    <form
      action={action}
      className="border-border grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(10rem,.8fr)_auto] sm:items-end"
    >
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="productId" value={item.productId} />
      <div className="min-w-0 self-center">
        <p className="text-fg truncate text-sm font-medium">
          {item.productName}
        </p>
        <p className="text-fg-subtle text-xs">
          Unidade: {item.purchaseUnit || "—"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`template-item-qty-${item.id}`}
          className="text-fg-subtle text-[11px]"
        >
          Quantidade
        </label>
        <Input
          id={`template-item-qty-${item.id}`}
          name="quantity"
          required
          inputMode="decimal"
          defaultValue={item.quantity}
          className="h-8"
          disabled={!canManage}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`template-item-notes-${item.id}`}
          className="text-fg-subtle text-[11px]"
        >
          Observação
        </label>
        <Input
          id={`template-item-notes-${item.id}`}
          name="notes"
          defaultValue={item.notes ?? ""}
          maxLength={300}
          className="h-8"
          disabled={!canManage}
        />
      </div>
      {canManage ? (
        <div className="flex items-center gap-1">
          <ItemSaveButton />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="text-destructive"
            formAction={removeSupplierPurchaseScheduleItem.bind(
              null,
              item.id,
              scheduleId,
              supplierId,
            )}
            aria-label={`Remover ${item.productName} do modelo`}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : null}
      {state.error || state.savedAt ? (
        <div className="sm:col-span-full">
          <ErrorLine error={state.error} />
          <SuccessLine message={state.savedAt ? "Produto atualizado." : null} />
        </div>
      ) : null}
    </form>
  );
}

function TemplateItems({
  schedule,
  supplierId,
  items,
  products,
  canManage,
}: {
  schedule: SupplierPurchaseSchedule;
  supplierId: string;
  items: ScheduleTemplateItem[];
  products: Product[];
  canManage: boolean;
}) {
  const scheduleItems = items.filter((item) => item.scheduleId === schedule.id);

  return (
    <div className="border-border mt-3 border-t pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-fg text-xs font-semibold">Modelo de produtos</p>
        <span className="text-fg-subtle text-xs">
          {scheduleItems.length}{" "}
          {scheduleItems.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {scheduleItems.length === 0 ? (
        <p className="text-fg-subtle text-xs">
          Sem produtos fixos. O pedido ou a cotação abrirão somente com o
          fornecedor preenchido.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {scheduleItems.map((item) => (
            <ExistingTemplateItemForm
              key={item.id}
              item={item}
              scheduleId={schedule.id}
              supplierId={supplierId}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {canManage ? (
        <details className="border-border mt-2 rounded-lg border border-dashed">
          <summary className="text-fg-muted hover:bg-surface-muted flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">
            <PackagePlus className="size-3.5" aria-hidden /> Adicionar produto
            habitual
          </summary>
          <div className="border-border border-t p-3">
            <NewTemplateItemForm
              schedule={schedule}
              supplierId={supplierId}
              products={products.filter(
                (product) =>
                  !scheduleItems.some((item) => item.productId === product.id),
              )}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function SupplierScheduleManager({
  supplierId,
  schedules,
  templateItems,
  products,
  categories,
  today,
  canManage,
}: {
  supplierId: string;
  schedules: SupplierPurchaseSchedule[];
  templateItems: ScheduleTemplateItem[];
  products: Product[];
  categories: Category[];
  today: string;
  canManage: boolean;
}) {
  const active = schedules.filter((schedule) => schedule.isActive).length;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="text-primary size-4" aria-hidden />
            Agenda de compras
            {active > 0 ? (
              <span className="bg-primary-soft text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                {active} {active === 1 ? "rotina ativa" : "rotinas ativas"}
              </span>
            ) : null}
          </h2>
          <p className="text-fg-muted mt-1 text-sm">
            O sistema avisa antes de cada dia configurado e deixa de alertar
            quando o pedido ou a cotação já estiverem preparados.
          </p>
        </div>
      </div>

      {schedules.length === 0 ? (
        canManage ? (
          <ScheduleForm
            supplierId={supplierId}
            categories={categories}
            today={today}
          />
        ) : (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhuma rotina de compra cadastrada.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((schedule) => (
            <article
              key={schedule.id}
              className="border-border bg-surface rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <ScheduleSummary schedule={schedule} />
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <form
                      action={setSupplierPurchaseScheduleActive.bind(
                        null,
                        schedule.id,
                        supplierId,
                        !schedule.isActive,
                      )}
                    >
                      <Button type="submit" size="sm" variant="ghost">
                        {schedule.isActive ? (
                          <Pause aria-hidden />
                        ) : (
                          <Play aria-hidden />
                        )}
                        {schedule.isActive ? "Pausar" : "Reativar"}
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
              {schedule.notes ? (
                <p className="text-fg-muted mt-3 border-t border-current/10 pt-3 text-sm">
                  {schedule.notes}
                </p>
              ) : null}
              <TemplateItems
                schedule={schedule}
                supplierId={supplierId}
                items={templateItems}
                products={products}
                canManage={canManage}
              />
              {canManage ? (
                <details className="border-border mt-3 border-t pt-3">
                  <summary className="text-fg-muted hover:text-fg inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                    <Pencil className="size-3.5" aria-hidden /> Editar rotina
                  </summary>
                  <div className="mt-3">
                    <ScheduleForm
                      supplierId={supplierId}
                      categories={categories}
                      today={today}
                      schedule={schedule}
                    />
                  </div>
                </details>
              ) : null}
            </article>
          ))}

          {canManage ? (
            <details className="border-border rounded-xl border border-dashed">
              <summary className="text-fg-muted hover:bg-surface-muted flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
                <Plus className="size-4" aria-hidden /> Adicionar outra rotina
              </summary>
              <div className="border-border border-t p-3">
                <ScheduleForm
                  supplierId={supplierId}
                  categories={categories}
                  today={today}
                />
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
