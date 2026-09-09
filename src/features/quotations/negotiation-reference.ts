import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type NegotiationReferenceSummary = {
  id: string;
  roundSupplierId: string;
  status: string;
  expiresAt: string;
  firstAccessedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  itemCount: number;
  isExpired: boolean;
};

export type PublicNegotiationReferenceItem = {
  id: string;
  product_name: string;
  requested_quantity: number;
  purchase_unit: string;
  pricing_unit: string;
  reference_kind: "best_competitor" | "target";
  reference_price: number;
  reference_unit: string;
  supplier_price: number;
  submitted_price: number | null;
  submitted_at: string | null;
};

export type PublicNegotiationReference = {
  request_id: string;
  status: "active" | "completed";
  expires_at: string;
  company: {
    name: string;
    legal_name: string | null;
    logo_path: string | null;
  };
  supplier: { id: string; name: string };
  purchase_round: { id: string; title: string };
  items: PublicNegotiationReferenceItem[];
};

export async function listNegotiationReferenceRequests(
  companyId: string,
  roundId: string,
): Promise<NegotiationReferenceSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data: requests, error } = await supabase
    .from("negotiation_reference_requests")
    .select(
      "id, round_supplier_id, status, expires_at, first_accessed_at, completed_at, created_at",
    )
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar links de negociação: ${error.message}`);
  }
  const requestIds = (requests ?? []).map((request) => request.id);
  const items = requestIds.length
    ? await supabase
        .from("negotiation_reference_request_items")
        .select("request_id")
        .eq("company_id", companyId)
        .in("request_id", requestIds)
    : { data: [], error: null };
  if (items.error) {
    throw new Error(`Falha ao contar produtos negociados: ${items.error.message}`);
  }
  const countByRequest = new Map<string, number>();
  for (const item of items.data ?? []) {
    countByRequest.set(
      item.request_id,
      (countByRequest.get(item.request_id) ?? 0) + 1,
    );
  }

  return (requests ?? []).map((request) => ({
    id: request.id,
    roundSupplierId: request.round_supplier_id,
    status: request.status,
    expiresAt: request.expires_at,
    firstAccessedAt: request.first_accessed_at,
    completedAt: request.completed_at,
    createdAt: request.created_at,
    itemCount: countByRequest.get(request.id) ?? 0,
    isExpired: new Date(request.expires_at).getTime() <= Date.now(),
  }));
}

export async function getPublicNegotiationReference(
  token: string,
): Promise<PublicNegotiationReference | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_public_get_negotiation_reference",
    { p_token: token },
  );
  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao abrir a negociação: ${error.message}`);
  }
  return data as unknown as PublicNegotiationReference;
}
