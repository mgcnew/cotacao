import { barcodeCandidates, normalizeBarcode } from "@/features/products/barcodes";
import { getActiveCompany, getUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Quem já usa este código de barras.
 *
 * É uma rota, e não uma Server Action, porque a consulta roda enquanto a
 * pessoa ainda preenche o cadastro: as actions entram numa fila única por aba
 * e esta ficaria esperando atrás de qualquer gravação em andamento.
 *
 * Serve só para avisar cedo. Quem decide é `createProduct`, que repete a
 * checagem na hora de gravar.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const company = await getActiveCompany();
  if (!company || !company.permissions.includes("product.create")) {
    return Response.json({ error: "Acesso não permitido." }, { status: 403 });
  }

  const code = normalizeBarcode(
    new URL(request.url).searchParams.get("code") ?? "",
  );
  if (!code || code.length > 64) {
    return Response.json({ error: "Código inválido." }, { status: 400 });
  }

  // Na edição, o código do próprio produto não é conflito.
  const own = new URL(request.url).searchParams.get("produto");

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("product_barcodes")
    .select("products ( name )")
    .eq("company_id", company.companyId)
    .in("code", [...barcodeCandidates(code)]);
  if (own && /^[0-9a-f-]{36}$/i.test(own)) query = query.neq("product_id", own);
  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return Response.json(
      { error: "Não foi possível consultar o código." },
      { status: 500 },
    );
  }

  return Response.json(
    { productName: data?.products?.name ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
