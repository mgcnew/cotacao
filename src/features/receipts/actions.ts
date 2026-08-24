"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReceiptActionState = {
  error: string | null;
  savedAt?: number;
  receiptId?: string;
};

function decimal(value: FormDataEntryValue | null): string {
  return String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
}

export async function registerOrderArrival(
  _previous: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.create")) {
    return { error: "Seu papel não permite registrar a chegada." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const receivedAt = String(formData.get("receivedAt") ?? "").trim();
  const parsedReceivedAt = receivedAt ? new Date(receivedAt) : null;
  if (parsedReceivedAt && Number.isNaN(parsedReceivedAt.getTime())) {
    return { error: "Data e hora de chegada inválidas." };
  }
  const invoiceTotal = decimal(formData.get("invoiceTotal"));
  if (
    invoiceTotal &&
    (!Number.isFinite(Number(invoiceTotal)) || Number(invoiceTotal) < 0)
  ) {
    return { error: "Valor total da nota inválido." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_register_order_arrival", {
    p_company_id: company.companyId,
    p_order_id: orderId,
    p_received_at: parsedReceivedAt?.toISOString(),
    p_invoice_number:
      String(formData.get("invoiceNumber") ?? "").trim() || undefined,
    p_invoice_series:
      String(formData.get("invoiceSeries") ?? "").trim() || undefined,
    p_invoice_total: invoiceTotal ? Number(invoiceTotal) : undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  if (error) {
    if (error.message.includes("já possui uma chegada")) {
      return { error: "Este pedido já está aguardando conferência." };
    }
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite registrar a chegada." };
    }
    return { error: `Não foi possível registrar a chegada: ${error.message}` };
  }

  const receiptId = (data as { receipt_id?: string } | null)?.receipt_id;
  revalidatePath("/recebimentos");
  revalidatePath(`/pedidos/${orderId}`);
  return { error: null, savedAt: Date.now(), receiptId };
}

export async function postDraftReceipt(
  _previous: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite finalizar a conferência." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const itemIds = [...new Set(formData.getAll("itemId").map(String))];
  const items: {
    order_revision_item_id: string;
    logistic_quantity_received: string;
    pricing_quantity_received: string;
    practiced_price: string;
    notes?: string;
  }[] = [];

  for (const id of itemIds) {
    const logistic = decimal(formData.get(`log_${id}`));
    const pricing = decimal(formData.get(`prec_${id}`));
    const price = decimal(formData.get(`preco_${id}`));
    const name = String(formData.get(`nome_${id}`) ?? "este item");
    if (!logistic && !pricing) continue;
    if (!logistic || !pricing || !price) {
      return {
        error: `Em "${name}", preencha quantidade recebida, quantidade de precificação e preço da nota.`,
      };
    }
    if (
      ![logistic, pricing, price].every(
        (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
      ) ||
      Number(logistic) <= 0
    ) {
      return { error: `Há valor inválido em "${name}".` };
    }
    items.push({
      order_revision_item_id: id,
      logistic_quantity_received: logistic,
      pricing_quantity_received: pricing,
      practiced_price: price,
      notes: String(formData.get(`obs_${id}`) ?? "").trim() || undefined,
    });
  }

  if (items.length === 0) {
    return { error: "Informe ao menos um produto recebido." };
  }

  const invoiceTotal = decimal(formData.get("invoiceTotal"));
  if (
    invoiceTotal &&
    (!Number.isFinite(Number(invoiceTotal)) || Number(invoiceTotal) < 0)
  ) {
    return { error: "Valor total da nota inválido." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_post_draft_receipt", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
    p_items: items,
    p_invoice_number:
      String(formData.get("invoiceNumber") ?? "").trim() || undefined,
    p_invoice_series:
      String(formData.get("invoiceSeries") ?? "").trim() || undefined,
    p_invoice_total: invoiceTotal ? Number(invoiceTotal) : undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite finalizar a conferência." };
    }
    if (error.message.includes("já conferida")) {
      return { error: "Esta chegada já foi conferida por outra pessoa." };
    }
    return { error: `Não foi possível finalizar: ${error.message}` };
  }

  revalidatePath("/recebimentos");
  revalidatePath(`/recebimentos/${receiptId}`);
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  redirect("/recebimentos");
}
