"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { listDetectedPurchasePatterns } from "@/features/suppliers/purchase-patterns";
import { requireActiveCompany, requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PurchaseScheduleState = {
  error: string | null;
  savedAt?: number;
};

export type DetectedPatternState = {
  error: string | null;
  savedAt?: number;
};

const scheduleSchema = z.object({
  scheduleId: z.union([z.literal(""), z.uuid()]),
  supplierId: z.uuid({ error: "Fornecedor inválido." }),
  label: z
    .string()
    .trim()
    .max(120, "Nome muito longo.")
    .refine((value) => value.length === 0 || value.length >= 2, {
      error: "Use ao menos 2 caracteres no nome da rotina.",
    })
    .transform((v) => v || null),
  categoryId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  weekday: z.coerce.number().int().min(0).max(6),
  intervalWeeks: z.coerce.number().int().min(1).max(12),
  anchorDate: z.iso.date({ error: "Data-base inválida." }),
  preferredTime: z
    .string()
    .regex(/^$|^\d{2}:\d{2}$/, "Horário inválido.")
    .transform((v) => v || null),
  reminderDaysBefore: z.coerce.number().int().min(0).max(14),
  expectedDeliveryDays: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(30)])
    .transform((v) => (v === "" ? null : v)),
  notes: z
    .string()
    .trim()
    .max(500, "Observação muito longa.")
    .transform((v) => v || null),
});

function refresh(supplierId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/fornecedores");
  if (supplierId) revalidatePath(`/fornecedores/${supplierId}`);
}

export async function saveSupplierPurchaseSchedule(
  _previous: PurchaseScheduleState,
  formData: FormData,
): Promise<PurchaseScheduleState> {
  const company = await requireActiveCompany();
  const parsed = scheduleSchema.safeParse({
    scheduleId: formData.get("scheduleId") ?? "",
    supplierId: formData.get("supplierId"),
    label: formData.get("label") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    weekday: formData.get("weekday"),
    intervalWeeks: formData.get("intervalWeeks"),
    anchorDate: formData.get("anchorDate"),
    preferredTime: formData.get("preferredTime") ?? "",
    reminderDaysBefore: formData.get("reminderDaysBefore"),
    expectedDeliveryDays: formData.get("expectedDeliveryDays") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { scheduleId, supplierId, ...values } = parsed.data;
  const payload = {
    company_id: company.companyId,
    supplier_id: supplierId,
    label: values.label,
    category_id: values.categoryId,
    weekday: values.weekday,
    interval_weeks: values.intervalWeeks,
    anchor_date: values.anchorDate,
    preferred_time: values.preferredTime,
    reminder_days_before: values.reminderDaysBefore,
    expected_delivery_days: values.expectedDeliveryDays,
    notes: values.notes,
    snoozed_until: null,
    last_dismissed_occurrence: null,
  };

  const supabase = await createServerSupabaseClient();
  const result = scheduleId
    ? await supabase
        .from("supplier_purchase_schedules")
        .update(payload)
        .eq("company_id", company.companyId)
        .eq("supplier_id", supplierId)
        .eq("id", scheduleId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("supplier_purchase_schedules")
        .insert(payload)
        .select("id")
        .single();

  if (result.error) {
    return {
      error: `Não foi possível salvar a agenda: ${result.error.message}`,
    };
  }
  if (!result.data) return { error: "Agenda não encontrada ou sem permissão." };

  refresh(supplierId);
  return { error: null, savedAt: Date.now() };
}

export async function setSupplierPurchaseScheduleActive(
  scheduleId: string,
  supplierId: string,
  isActive: boolean,
) {
  const company = await requireActiveCompany();
  const ids = z.object({ scheduleId: z.uuid(), supplierId: z.uuid() }).parse({
    scheduleId,
    supplierId,
  });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("supplier_purchase_schedules")
    .update({ is_active: isActive, snoozed_until: null })
    .eq("company_id", company.companyId)
    .eq("supplier_id", ids.supplierId)
    .eq("id", ids.scheduleId);

  if (error)
    throw new Error(`Não foi possível alterar a agenda: ${error.message}`);
  refresh(ids.supplierId);
}

export async function dismissPurchaseSchedule(
  scheduleId: string,
  occurrenceDate: string,
) {
  const company = await requireActiveCompany();
  const parsed = z
    .object({ scheduleId: z.uuid(), occurrenceDate: z.iso.date() })
    .parse({ scheduleId, occurrenceDate });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("supplier_purchase_schedules")
    .update({
      last_dismissed_occurrence: parsed.occurrenceDate,
      snoozed_until: null,
    })
    .eq("company_id", company.companyId)
    .eq("id", parsed.scheduleId);
  if (error)
    throw new Error(`Não foi possível dispensar o lembrete: ${error.message}`);
  refresh();
}

export async function snoozePurchaseSchedule(scheduleId: string) {
  const company = await requireActiveCompany();
  const parsedId = z.uuid().parse(scheduleId);
  const supabase = await createServerSupabaseClient();
  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", company.companyId)
    .single();
  if (companyError)
    throw new Error(`Não foi possível ler o fuso: ${companyError.message}`);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: companyRow.timezone,
  }).format(new Date());
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const { error } = await supabase
    .from("supplier_purchase_schedules")
    .update({ snoozed_until: tomorrow.toISOString().slice(0, 10) })
    .eq("company_id", company.companyId)
    .eq("id", parsedId);
  if (error)
    throw new Error(`Não foi possível adiar o lembrete: ${error.message}`);
  refresh();
}

const scheduleItemSchema = z.object({
  itemId: z.union([z.literal(""), z.uuid()]),
  scheduleId: z.uuid({ error: "Rotina inválida." }),
  supplierId: z.uuid({ error: "Fornecedor inválido." }),
  productId: z.uuid({ error: "Escolha um produto." }),
  quantity: z
    .string()
    .trim()
    .min(1, "Informe a quantidade habitual.")
    .transform((value) => Number(value.replace(/\./g, "").replace(",", ".")))
    .refine((value) => Number.isFinite(value) && value > 0, {
      error: "A quantidade deve ser maior que zero.",
    }),
  notes: z
    .string()
    .trim()
    .max(300, "Observação muito longa.")
    .transform((value) => value || null),
});

export async function saveSupplierPurchaseScheduleItem(
  _previous: PurchaseScheduleState,
  formData: FormData,
): Promise<PurchaseScheduleState> {
  const company = await requireActiveCompany();
  const parsed = scheduleItemSchema.safeParse({
    itemId: formData.get("itemId") ?? "",
    scheduleId: formData.get("scheduleId"),
    supplierId: formData.get("supplierId"),
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { data: schedule, error: scheduleError } = await supabase
    .from("supplier_purchase_schedules")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("supplier_id", parsed.data.supplierId)
    .eq("id", parsed.data.scheduleId)
    .maybeSingle();
  if (scheduleError) {
    return {
      error: `Não foi possível conferir a rotina: ${scheduleError.message}`,
    };
  }
  if (!schedule) return { error: "Esta rotina não pertence ao fornecedor." };

  const payload = {
    company_id: company.companyId,
    schedule_id: parsed.data.scheduleId,
    product_id: parsed.data.productId,
    default_quantity: parsed.data.quantity,
    notes: parsed.data.notes,
  };
  const result = parsed.data.itemId
    ? await supabase
        .from("supplier_purchase_schedule_items")
        .update(payload)
        .eq("company_id", company.companyId)
        .eq("schedule_id", parsed.data.scheduleId)
        .eq("id", parsed.data.itemId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("supplier_purchase_schedule_items")
        .insert(payload)
        .select("id")
        .single();

  if (result.error) {
    return {
      error:
        result.error.code === "23505"
          ? "Este produto já está no modelo desta rotina. Edite a linha existente."
          : `Não foi possível salvar o produto: ${result.error.message}`,
    };
  }
  if (!result.data) return { error: "Produto da rotina não encontrado." };
  refresh(parsed.data.supplierId);
  return { error: null, savedAt: Date.now() };
}

export async function removeSupplierPurchaseScheduleItem(
  itemId: string,
  scheduleId: string,
  supplierId: string,
) {
  const company = await requireActiveCompany();
  const ids = z
    .object({ itemId: z.uuid(), scheduleId: z.uuid(), supplierId: z.uuid() })
    .parse({ itemId, scheduleId, supplierId });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("supplier_purchase_schedule_items")
    .delete()
    .eq("company_id", company.companyId)
    .eq("schedule_id", ids.scheduleId)
    .eq("id", ids.itemId);
  if (error)
    throw new Error(`Não foi possível remover o produto: ${error.message}`);
  refresh(ids.supplierId);
}

export async function acceptDetectedPurchasePattern(
  _previous: DetectedPatternState,
  formData: FormData,
): Promise<DetectedPatternState> {
  const company = await requireActiveCompany();
  const supplierId = z.uuid().safeParse(formData.get("supplierId"));
  if (!supplierId.success) return { error: "Fornecedor inválido." };

  // O padrão é recalculado no servidor para não aceitar uma inferência antiga
  // depois de novos pedidos ou de uma agenda criada em outra aba.
  const pattern = (await listDetectedPurchasePatterns(company.companyId)).find(
    (candidate) => candidate.supplierId === supplierId.data,
  );
  if (!pattern) {
    return {
      error: "Este padrão já mudou, foi dispensado ou possui uma agenda.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("supplier_purchase_schedules").insert({
    company_id: company.companyId,
    supplier_id: pattern.supplierId,
    label: "Rotina detectada pelo histórico",
    weekday: pattern.weekday,
    interval_weeks: pattern.intervalWeeks,
    anchor_date: pattern.anchorDate,
    reminder_days_before: 1,
    notes: `Padrão sugerido após ${pattern.orderCount} pedidos (${pattern.confidencePercent}% de regularidade).`,
  });
  if (error) {
    return { error: `Não foi possível criar o lembrete: ${error.message}` };
  }

  refresh(pattern.supplierId);
  return { error: null, savedAt: Date.now() };
}

export async function dismissDetectedPurchasePattern(
  _previous: DetectedPatternState,
  formData: FormData,
): Promise<DetectedPatternState> {
  const company = await requireActiveCompany();
  const user = await requireUser();
  const supplierId = z.uuid().safeParse(formData.get("supplierId"));
  if (!supplierId.success) return { error: "Fornecedor inválido." };

  const pattern = (await listDetectedPurchasePatterns(company.companyId)).find(
    (candidate) => candidate.supplierId === supplierId.data,
  );
  if (!pattern) return { error: "Este padrão já não está disponível." };

  const supabase = await createServerSupabaseClient();
  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", company.companyId)
    .single();
  if (companyError) {
    return { error: `Não foi possível ler o fuso: ${companyError.message}` };
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: companyRow.timezone,
  }).format(new Date());
  const dismissedUntil = new Date(`${today}T00:00:00Z`);
  dismissedUntil.setUTCDate(dismissedUntil.getUTCDate() + 30);

  const { error } = await supabase
    .from("supplier_purchase_pattern_decisions")
    .upsert(
      {
        company_id: company.companyId,
        supplier_id: pattern.supplierId,
        dismissed_until: dismissedUntil.toISOString().slice(0, 10),
        detected_weekday: pattern.weekday,
        detected_interval_weeks: pattern.intervalWeeks,
        order_count: pattern.orderCount,
        decided_by: user.id,
      },
      { onConflict: "company_id,supplier_id" },
    );
  if (error) {
    return { error: `Não foi possível dispensar o padrão: ${error.message}` };
  }

  refresh(pattern.supplierId);
  return { error: null, savedAt: Date.now() };
}
