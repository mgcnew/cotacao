"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActiveCompany, requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DemandCalendarState = {
  error: string | null;
  savedAt?: number;
};

const eventSchema = z
  .object({
    eventId: z.union([z.literal(""), z.uuid()]),
    name: z.string().trim().min(2, "Informe o nome do evento.").max(120),
    eventType: z.enum(["holiday", "payday", "promotion", "seasonal", "other"]),
    startDate: z.iso.date({ error: "Data inicial inválida." }),
    endDate: z.iso.date({ error: "Data final inválida." }),
    recurrence: z.enum(["one_time", "weekly", "monthly", "yearly"]),
    recurrenceUntil: z.union([z.literal(""), z.iso.date()]),
    adjustmentPercent: z.coerce.number().min(-80).max(200),
    scope: z.enum(["all", "category", "product"]),
    categoryId: z.union([z.literal(""), z.uuid()]),
    productId: z.union([z.literal(""), z.uuid()]),
    notes: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A data final deve ser igual ou posterior à inicial.",
      });
    }
    if (
      value.recurrence !== "one_time" &&
      value.recurrenceUntil &&
      value.recurrenceUntil < value.startDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["recurrenceUntil"],
        message: "O término da repetição deve ser posterior ao início.",
      });
    }
    if (value.scope === "category" && !value.categoryId) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Escolha uma categoria.",
      });
    }
    if (value.scope === "product" && !value.productId) {
      context.addIssue({
        code: "custom",
        path: ["productId"],
        message: "Escolha um produto.",
      });
    }
  });

function refresh() {
  revalidatePath("/configuracoes");
  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
}

export async function saveDemandCalendarEvent(
  _previous: DemandCalendarState,
  formData: FormData,
): Promise<DemandCalendarState> {
  const company = await requireActiveCompany();
  const user = await requireUser();
  const parsed = eventSchema.safeParse({
    eventId: formData.get("eventId") ?? "",
    name: formData.get("name"),
    eventType: formData.get("eventType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    recurrence: formData.get("recurrence"),
    recurrenceUntil: formData.get("recurrenceUntil") ?? "",
    adjustmentPercent: String(formData.get("adjustmentPercent") ?? "").replace(
      ",",
      ".",
    ),
    scope: formData.get("scope"),
    categoryId: formData.get("categoryId") ?? "",
    productId: formData.get("productId") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { eventId, ...event } = parsed.data;
  const payload = {
    company_id: company.companyId,
    name: event.name,
    event_type: event.eventType,
    start_date: event.startDate,
    end_date: event.endDate,
    recurrence: event.recurrence,
    recurrence_until:
      event.recurrence === "one_time" ? null : event.recurrenceUntil || null,
    adjustment_percent: event.adjustmentPercent,
    scope: event.scope,
    category_id: event.scope === "category" ? event.categoryId : null,
    product_id: event.scope === "product" ? event.productId : null,
    notes: event.notes,
  };
  const supabase = await createServerSupabaseClient();
  const result = eventId
    ? await supabase
        .from("demand_calendar_events")
        .update(payload)
        .eq("company_id", company.companyId)
        .eq("id", eventId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("demand_calendar_events")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();
  if (result.error) {
    return {
      error: `Não foi possível salvar o evento: ${result.error.message}`,
    };
  }
  if (!result.data) return { error: "Evento não encontrado ou sem permissão." };

  refresh();
  return { error: null, savedAt: Date.now() };
}

export async function setDemandCalendarEventActive(
  eventId: string,
  isActive: boolean,
) {
  const company = await requireActiveCompany();
  const parsedId = z.uuid().parse(eventId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("demand_calendar_events")
    .update({ is_active: isActive })
    .eq("company_id", company.companyId)
    .eq("id", parsedId);
  if (error)
    throw new Error(`Não foi possível alterar o evento: ${error.message}`);
  refresh();
}

export async function removeDemandCalendarEvent(eventId: string) {
  const company = await requireActiveCompany();
  const parsedId = z.uuid().parse(eventId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("demand_calendar_events")
    .delete()
    .eq("company_id", company.companyId)
    .eq("id", parsedId);
  if (error)
    throw new Error(`Não foi possível excluir o evento: ${error.message}`);
  refresh();
}
