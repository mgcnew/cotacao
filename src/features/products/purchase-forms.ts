import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Uma forma de compra pronta para seletor: "cx (12 un)". */
export type PurchaseFormOption = {
  id: string;
  /** Sigla da unidade da forma: "cx". */
  unit: string;
  /** Sigla da unidade-base: "un". */
  baseUnit: string;
  /** Quanto de base vale 1 da forma: 12. */
  perUnit: number;
  /** "cx (12 un)" — para lista, seletor e tabela. */
  label: string;
};

const QTD = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function purchaseFormLabel(unit: string, perUnit: number, baseUnit: string) {
  return `${unit} (${QTD.format(perUnit)} ${baseUnit})`;
}

/** "2 cx" → "24 un". Nulo quando não há forma. */
export function baseEquivalent(
  quantity: number,
  form: Pick<PurchaseFormOption, "perUnit" | "baseUnit"> | null | undefined,
) {
  if (!form) return null;
  return `${QTD.format(quantity * form.perUnit)} ${form.baseUnit}`;
}

/**
 * Todas as formas de compra da empresa, por produto (0127).
 *
 * Uma consulta só, e não uma por produto: quem chama já tem o catálogo e só
 * precisa pendurar as formas nele. Sem a migration aplicada, volta vazio — a
 * tela segue mostrando só a forma padrão.
 */
export async function listPurchaseFormsByProduct(
  companyId: string,
): Promise<Map<string, PurchaseFormOption[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_purchase_forms")
    .select(
      `
      id,
      product_id,
      unit_quantity,
      base_quantity,
      unit:units!product_purchase_forms_company_id_unit_id_fkey ( symbol ),
      base_unit:units!product_purchase_forms_company_id_base_unit_id_fkey ( symbol )
    `,
    )
    .eq("company_id", companyId)
    .order("created_at");

  const byProduct = new Map<string, PurchaseFormOption[]>();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return byProduct;
    throw new Error(`Falha ao carregar formas de compra: ${error.message}`);
  }

  for (const row of data ?? []) {
    const unit = row.unit?.symbol ?? "";
    const baseUnit = row.base_unit?.symbol ?? "";
    const perUnit = Number(row.base_quantity) / Number(row.unit_quantity);
    const list = byProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      unit,
      baseUnit,
      perUnit,
      label: purchaseFormLabel(unit, perUnit, baseUnit),
    });
    byProduct.set(row.product_id, list);
  }
  return byProduct;
}
