"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { publicEnv } from "@/lib/env";
import { roundedMoneyString } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type NegotiationReferenceState = {
  error: string | null;
  url?: string;
  savedAt?: number;
  submitted?: boolean;
};

function money(raw: FormDataEntryValue | null) {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const value = Number(roundedMoneyString(normalized));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function createNegotiationReference(
  _previous: NegotiationReferenceState,
  formData: FormData,
): Promise<NegotiationReferenceState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("negotiation.create")) {
    return { error: "Seu papel não permite abrir negociações." };
  }

  const roundId = z.uuid().safeParse(formData.get("roundId"));
  const roundSupplierId = z.uuid().safeParse(formData.get("roundSupplierId"));
  const validityDays = Number(formData.get("validityDays"));
  if (!roundId.success || !roundSupplierId.success) {
    return { error: "Rodada ou fornecedor inválido." };
  }
  if (![1, 3, 7].includes(validityDays)) {
    return { error: "Escolha uma validade para o link." };
  }

  const ids = formData.getAll("referenceItemId").map(String);
  const items = [];
  for (const id of ids) {
    const parsedId = z.uuid().safeParse(id);
    const kind = String(formData.get(`referenceKind_${id}`) ?? "");
    const referencePrice = money(formData.get(`referencePrice_${id}`));
    if (!parsedId.success || !["best_competitor", "target"].includes(kind)) {
      return { error: "Há um produto com referência inválida." };
    }
    if (referencePrice === null) {
      return { error: "Informe um preço de referência maior que zero." };
    }
    items.push({
      response_item_id: parsedId.data,
      reference_kind: kind,
      reference_price: referencePrice,
      use_comparison_unit:
        formData.get(`useComparisonUnit_${id}`) === "true",
    });
  }
  if (items.length === 0) {
    return { error: "Escolha ao menos um produto para negociar." };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(
    Date.now() + validityDays * 24 * 60 * 60 * 1000,
  );
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(
    "rpc_create_negotiation_reference_request",
    {
      p_company_id: company.companyId,
      p_round_supplier_id: roundSupplierId.data,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
      p_items: items,
    },
  );
  if (error) {
    if (error.message.includes("em andamento")) {
      return { error: "A cotação precisa estar em andamento." };
    }
    return { error: `Não foi possível gerar o link: ${error.message}` };
  }

  revalidatePath(`/compras/${roundId.data}/comparacao`);
  return {
    error: null,
    savedAt: Date.now(),
    url: `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/n/${token}`,
  };
}

export async function revokeNegotiationReference(
  _previous: NegotiationReferenceState,
  formData: FormData,
): Promise<NegotiationReferenceState> {
  const company = await requireActiveCompany();
  const requestId = z.uuid().safeParse(formData.get("requestId"));
  const roundId = z.uuid().safeParse(formData.get("roundId"));
  if (!requestId.success || !roundId.success) {
    return { error: "Link de negociação inválido." };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_revoke_negotiation_reference_request",
    { p_company_id: company.companyId, p_request_id: requestId.data },
  );
  if (error) return { error: `Não foi possível revogar: ${error.message}` };
  if (!data) return { error: "Este link já foi encerrado ou revogado." };
  revalidatePath(`/compras/${roundId.data}/comparacao`);
  return { error: null, savedAt: Date.now() };
}

export async function submitNegotiationReference(
  _previous: NegotiationReferenceState,
  formData: FormData,
): Promise<NegotiationReferenceState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Link inválido." };
  const ids = formData.getAll("itemId").map(String);
  const items = [];
  for (const id of ids) {
    const parsedId = z.uuid().safeParse(id);
    const newPrice = money(formData.get(`newPrice_${id}`));
    if (!parsedId.success || newPrice === null) {
      return { error: "Informe um novo preço válido para cada produto." };
    }
    items.push({ id: parsedId.data, new_price: newPrice });
  }
  if (items.length === 0) return { error: "Nenhum produto para responder." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(
    "rpc_public_submit_negotiation_reference",
    { p_token: token, p_items: items },
  );
  if (error) {
    if (error.code === "42501") {
      return { error: "Este link expirou ou foi revogado." };
    }
    if (error.message.includes("já foi enviada")) {
      return { error: "Esta contraproposta já foi enviada." };
    }
    return { error: `Não foi possível enviar: ${error.message}` };
  }
  revalidatePath(`/n/${token}`);
  return { error: null, submitted: true, savedAt: Date.now() };
}
