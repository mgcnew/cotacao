import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Matriz de comparação de uma rodada: itens nas linhas, fornecedores nas
 * colunas.
 *
 * Montada com consultas planas e cruzada em memória, em vez de um embed
 * aninhado do PostgREST. São poucas linhas por rodada, e o caminho
 * `quotation_items → supplier_quotation_items → quotation_response_items`
 * tem FK composta em cada salto — o embed ficaria ilegível e frágil.
 *
 * O preço exibido vem de `v_current_response_prices`: ela já resolve
 * "preço cotado" contra "último preço negociado", que é a informação que o
 * comprador precisa ver.
 */

export type ComparisonCell = {
  responseItemId: string | null;
  quotedPrice: number | null;
  currentPrice: number | null;
  negotiated: boolean;
  doesNotSupply: boolean;
  notes: string | null;
  /** Atributos que o fornecedor declarou, ex.: quantidade por pacote. */
  attributes: { name: string; value: string }[];
  /**
   * Preço na unidade de comparação, quando dá para calcular.
   * É o preço vigente dividido pelo fator que o fornecedor informou.
   */
  normalizedPrice: number | null;
  /** Quantas correções o comprador já fez neste item de resposta. */
  correctionCount: number;
};

export type ComparisonRow = {
  itemId: string;
  supplierQuotationItemBySupplier: Map<string, string>;
  productName: string;
  groupName: string;
  requestedQuantity: number;
  purchaseUnit: string;
  pricingUnit: string;
  comparisonUnit: string | null;
  cells: Map<string, ComparisonCell>;
  bestPrice: number | null;
  /** Menor preço normalizado — o que de fato compara propostas diferentes. */
  bestNormalized: number | null;
  /** Nome do atributo que converte, quando a categoria define um. */
  conversionName: string | null;
};

export async function getRoundComparison(companyId: string, roundId: string) {
  const supabase = await createServerSupabaseClient();

  const [itemsRes, roundSuppliersRes] = await Promise.all([
    supabase
      .from("quotation_items")
      .select(
        `
        id,
        requested_quantity,
        group_id,
        products!inner ( name ),
        purchase_unit:units!quotation_items_company_id_purchase_unit_id_fkey ( symbol ),
        pricing_unit:units!quotation_items_company_id_pricing_unit_id_fkey ( symbol ),
        comparison_unit:units!quotation_items_company_id_comparison_unit_id_fkey ( symbol )
      `,
      )
      .eq("company_id", companyId)
      .eq("purchase_round_id", roundId)
      .order("created_at"),
    supabase
      .from("round_suppliers")
      .select("id, supplier_id, completed_at, suppliers!inner ( name )")
      .eq("company_id", companyId)
      .eq("purchase_round_id", roundId)
      .order("created_at"),
  ]);

  if (itemsRes.error) {
    throw new Error(`Falha ao carregar itens: ${itemsRes.error.message}`);
  }
  if (roundSuppliersRes.error) {
    throw new Error(
      `Falha ao carregar fornecedores: ${roundSuppliersRes.error.message}`,
    );
  }

  const items = itemsRes.data ?? [];
  const roundSuppliers = roundSuppliersRes.data ?? [];

  const groups = await supabase
    .from("purchase_round_groups")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId);

  const groupName = new Map((groups.data ?? []).map((g) => [g.id, g.name]));

  if (items.length === 0 || roundSuppliers.length === 0) {
    return { rows: [] as ComparisonRow[], suppliers: roundSuppliers };
  }

  const roundSupplierIds = roundSuppliers.map((rs) => rs.id);

  const { data: links, error: linksError } = await supabase
    .from("supplier_quotation_items")
    .select("id, round_supplier_id, quotation_item_id")
    .eq("company_id", companyId)
    .in("round_supplier_id", roundSupplierIds)
    .is("removed_at", null);

  if (linksError) {
    throw new Error(`Falha ao carregar vínculos: ${linksError.message}`);
  }

  const linkIds = (links ?? []).map((l) => l.id);

  const [responsesRes, pricesRes] = await Promise.all([
    linkIds.length > 0
      ? supabase
          .from("quotation_response_items")
          .select(
            "id, supplier_quotation_item_id, quoted_price, does_not_supply, notes",
          )
          .eq("company_id", companyId)
          .in("supplier_quotation_item_id", linkIds)
      : Promise.resolve({ data: [], error: null }),
    linkIds.length > 0
      ? supabase
          .from("v_current_response_prices")
          .select(
            "quotation_response_item_id, supplier_quotation_item_id, quoted_price, current_price, last_negotiation_id",
          )
          .eq("company_id", companyId)
          .in("supplier_quotation_item_id", linkIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (responsesRes.error) {
    throw new Error(`Falha ao carregar respostas: ${responsesRes.error.message}`);
  }
  if (pricesRes.error) {
    throw new Error(`Falha ao carregar preços: ${pricesRes.error.message}`);
  }

  const responseIds = (responsesRes.data ?? []).map((r) => r.id);

  const { data: attrValues } = responseIds.length
    ? await supabase
        .from("quotation_response_attribute_values")
        .select(
          `
          quotation_response_item_id,
          value_text,
          value_numeric,
          value_boolean,
          product_attribute_definitions!inner ( name, is_conversion_factor )
        `,
        )
        .eq("company_id", companyId)
        .in("quotation_response_item_id", responseIds)
    : { data: [] };

  const { data: corrections } = responseIds.length
    ? await supabase
        .from("response_item_corrections")
        .select("quotation_response_item_id")
        .eq("company_id", companyId)
        .in("quotation_response_item_id", responseIds)
    : { data: [] };

  const correctionsByResponse = new Map<string, number>();
  for (const row of corrections ?? []) {
    correctionsByResponse.set(
      row.quotation_response_item_id,
      (correctionsByResponse.get(row.quotation_response_item_id) ?? 0) + 1,
    );
  }

  const attrsByResponse = new Map<string, { name: string; value: string }[]>();
  // Fator de conversão declarado pelo fornecedor, por item de resposta.
  const factorByResponse = new Map<string, number>();
  let conversionName: string | null = null;

  for (const row of attrValues ?? []) {
    const value =
      row.value_numeric !== null
        ? String(row.value_numeric)
        : row.value_boolean !== null
          ? row.value_boolean
            ? "sim"
            : "não"
          : (row.value_text ?? "");

    const list = attrsByResponse.get(row.quotation_response_item_id) ?? [];
    list.push({ name: row.product_attribute_definitions.name, value });
    attrsByResponse.set(row.quotation_response_item_id, list);

    // Zero e negativo ficam de fora: dividir por eles daria infinito ou preço
    // negativo, e um número desses só pode ser erro de digitação.
    if (
      row.product_attribute_definitions.is_conversion_factor &&
      row.value_numeric !== null &&
      Number(row.value_numeric) > 0
    ) {
      factorByResponse.set(
        row.quotation_response_item_id,
        Number(row.value_numeric),
      );
      conversionName = row.product_attribute_definitions.name;
    }
  }

  const priceByLink = new Map(
    (pricesRes.data ?? []).map((p) => [p.supplier_quotation_item_id, p]),
  );
  const responseByLink = new Map(
    (responsesRes.data ?? []).map((r) => [r.supplier_quotation_item_id, r]),
  );

  const rows: ComparisonRow[] = items.map((item) => {
    const cells = new Map<string, ComparisonCell>();
    const linkBySupplier = new Map<string, string>();
    const precos: number[] = [];
    const normalizados: number[] = [];

    for (const rs of roundSuppliers) {
      const link = (links ?? []).find(
        (l) => l.round_supplier_id === rs.id && l.quotation_item_id === item.id,
      );
      if (!link) continue;

      linkBySupplier.set(rs.id, link.id);

      const response = responseByLink.get(link.id);
      const price = priceByLink.get(link.id);

      if (!response) {
        cells.set(rs.id, {
          responseItemId: null,
          quotedPrice: null,
          currentPrice: null,
          negotiated: false,
          doesNotSupply: false,
          notes: null,
          attributes: [],
          normalizedPrice: null,
          correctionCount: 0,
        });
        continue;
      }

      const current =
        price?.current_price !== undefined && price?.current_price !== null
          ? Number(price.current_price)
          : response.quoted_price !== null
            ? Number(response.quoted_price)
            : null;

      if (!response.does_not_supply && current !== null) precos.push(current);

      const factor = factorByResponse.get(response.id);
      const normalized =
        current !== null && factor && !response.does_not_supply
          ? current / factor
          : null;

      if (normalized !== null) normalizados.push(normalized);

      cells.set(rs.id, {
        responseItemId: response.id,
        quotedPrice:
          response.quoted_price !== null ? Number(response.quoted_price) : null,
        currentPrice: current,
        negotiated: Boolean(price?.last_negotiation_id),
        doesNotSupply: response.does_not_supply,
        notes: response.notes,
        attributes: attrsByResponse.get(response.id) ?? [],
        normalizedPrice: normalized,
        correctionCount: correctionsByResponse.get(response.id) ?? 0,
      });
    }

    return {
      itemId: item.id,
      supplierQuotationItemBySupplier: linkBySupplier,
      productName: item.products.name,
      groupName: groupName.get(item.group_id) ?? "—",
      requestedQuantity: Number(item.requested_quantity),
      purchaseUnit: item.purchase_unit?.symbol ?? "",
      pricingUnit: item.pricing_unit?.symbol ?? "",
      comparisonUnit: item.comparison_unit?.symbol ?? null,
      cells,
      bestPrice: precos.length > 0 ? Math.min(...precos) : null,
      bestNormalized:
        normalizados.length > 0 ? Math.min(...normalizados) : null,
      conversionName,
    };
  });

  return { rows, suppliers: roundSuppliers };
}
