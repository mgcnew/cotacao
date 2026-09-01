"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isValidCnpj } from "@/features/company/cnpj";
import {
  parseHistoricalNfeXml,
  type HistoricalNfeItem,
} from "@/features/receipts/historical-nfe";
import {
  matchNfeItem,
  nfeQuantityForUnit,
  normalizedBarcode,
} from "@/features/receipts/nfe";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const XML_MAX_SIZE = 4 * 1024 * 1024;

export type HistoricalNfeActionState = {
  error: string | null;
};

export type HistoricalNfeUploadResult = HistoricalNfeActionState & {
  importId: string | null;
};

function cleanDocument(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function parsedIssuedAt(value: string | null) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00-03:00`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function suggestedPricing(
  item: HistoricalNfeItem,
  pricingUnits: Array<string | null | undefined>,
) {
  for (const unit of pricingUnits) {
    if (!unit) continue;
    const quantity = nfeQuantityForUnit(item, unit);
    if (quantity !== null && quantity > 0) {
      return {
        quantity,
        price: item.netProductTotal / quantity,
      };
    }
  }
  return { quantity: null, price: null };
}

/**
 * O PostgREST limita respostas a 1.000 linhas. A associação automática precisa
 * enxergar o catálogo inteiro, inclusive produtos no fim do alfabeto.
 */
async function listProductsForHistoricalMatch(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
) {
  const data = [];
  for (let start = 0; ; start += 1000) {
    const page = await supabase
      .from("products")
      .select(
        `
          id, name,
          pricing_unit:units!products_company_id_pricing_unit_id_fkey ( code, symbol ),
          product_barcodes ( code, is_active )
        `,
      )
      .eq("company_id", companyId)
      .order("name")
      .order("id")
      .range(start, start + 999);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return { data, error: null };
}

export async function uploadHistoricalNfe(
  formData: FormData,
): Promise<HistoricalNfeUploadResult> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return {
      error: "Seu papel não permite importar histórico fiscal.",
      importId: null,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o XML autorizado da NF-e.", importId: null };
  }
  if (file.size > XML_MAX_SIZE)
    return { error: "O XML deve ter no máximo 4 MB.", importId: null };
  if (!file.name.toLowerCase().endsWith(".xml")) {
    return {
      error: "O documento precisa ser um arquivo XML.",
      importId: null,
    };
  }

  let nfe: ReturnType<typeof parseHistoricalNfeXml>;
  try {
    nfe = parseHistoricalNfeXml(await file.text());
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "XML inválido.",
      importId: null,
    };
  }
  const issuedAt = parsedIssuedAt(nfe.issuedAt);
  if (!issuedAt || issuedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return {
      error: "A data de emissão informada na NF-e é inválida.",
      importId: null,
    };
  }

  const supabase = await createServerSupabaseClient();
  const [companyResult, suppliersResult, productsResult] = await Promise.all([
    supabase
      .from("companies")
      .select("document_number")
      .eq("id", company.companyId)
      .maybeSingle(),
    supabase
      .from("suppliers")
      .select("id, name, document_number")
      .eq("company_id", company.companyId),
    listProductsForHistoricalMatch(supabase, company.companyId),
  ]);
  if (companyResult.error || suppliersResult.error || productsResult.error) {
    return {
      error: "Não foi possível preparar a conciliação desta NF-e.",
      importId: null,
    };
  }

  const expectedRecipient = cleanDocument(companyResult.data?.document_number);
  const actualRecipient = cleanDocument(nfe.recipient.document);
  if (
    expectedRecipient &&
    actualRecipient &&
    expectedRecipient !== actualRecipient
  ) {
    return {
      error: "O destinatário da NF-e é diferente da empresa atual.",
      importId: null,
    };
  }

  const issuerDocument = cleanDocument(nfe.issuer.document);
  const exactSuppliers = (suppliersResult.data ?? []).filter(
    (supplier) =>
      issuerDocument &&
      cleanDocument(supplier.document_number) === issuerDocument,
  );
  const supplier = exactSuppliers.length === 1 ? exactSuppliers[0] : null;
  const aliasesResult = supplier
    ? await supabase
        .from("supplier_product_aliases")
        .select("product_id, supplier_code, supplier_name, barcode")
        .eq("company_id", company.companyId)
        .eq("supplier_id", supplier.id)
    : { data: [], error: null };
  if (aliasesResult.error) {
    return {
      error: "Não foi possível carregar as associações deste fornecedor.",
      importId: null,
    };
  }

  const aliasesByProduct = new Map<
    string,
    {
      supplierCode: string | null;
      supplierName: string;
      barcode: string | null;
    }[]
  >();
  for (const alias of aliasesResult.data ?? []) {
    const current = aliasesByProduct.get(alias.product_id) ?? [];
    current.push({
      supplierCode: alias.supplier_code,
      supplierName: alias.supplier_name,
      barcode: alias.barcode,
    });
    aliasesByProduct.set(alias.product_id, current);
  }
  const matchOptions = (productsResult.data ?? []).map((product) => ({
    id: product.id,
    productName: product.name,
    barcodes: (product.product_barcodes ?? [])
      .filter((barcode) => barcode.is_active)
      .map((barcode) => barcode.code),
    aliases: aliasesByProduct.get(product.id) ?? [],
  }));

  const items = nfe.items.map((item) => {
    const match = matchNfeItem(item, matchOptions);
    const product = match
      ? (productsResult.data ?? []).find(
          (candidate) => candidate.id === match.orderItemId,
        )
      : null;
    const pricing = product
      ? suggestedPricing(item, [
          product.pricing_unit?.symbol,
          product.pricing_unit?.code,
        ])
      : { quantity: null, price: null };
    return {
      product_id: product?.id ?? null,
      line_number: item.lineNumber,
      supplier_code: item.supplierCode,
      barcode: normalizedBarcode(item.barcode),
      tributary_barcode: normalizedBarcode(item.tributaryBarcode),
      description: item.description,
      commercial_unit: item.commercialUnit,
      commercial_quantity: item.commercialQuantity,
      commercial_unit_price: item.commercialUnitPrice,
      tributary_unit: item.tributaryUnit,
      tributary_quantity: item.tributaryQuantity,
      tributary_unit_price: item.tributaryUnitPrice,
      product_total: item.total,
      item_discount: item.itemDiscount,
      item_freight: item.itemFreight,
      item_insurance: item.itemInsurance,
      item_other: item.itemOther,
      net_product_total: item.netProductTotal,
      pricing_quantity: pricing.quantity,
      practiced_price: pricing.price,
      match_method: match?.method ?? null,
      match_confidence: match?.confidence ?? null,
    };
  });

  const importId = crypto.randomUUID();
  const safeFileName =
    file.name.split(/[\\/]/).pop()?.trim().slice(0, 255) ||
    `${nfe.accessKey}.xml`;
  const storagePath = `${company.companyId}/${importId}/${nfe.accessKey}.xml`;
  const created = await supabase.rpc("rpc_create_historical_nfe_import", {
    p_company_id: company.companyId,
    p_import_id: importId,
    p_supplier_id: supplier?.id ?? null,
    p_access_key: nfe.accessKey!,
    p_invoice_number: nfe.number,
    p_invoice_series: nfe.series,
    p_issued_at: issuedAt.toISOString(),
    p_issuer_document: nfe.issuer.document,
    p_issuer_name: nfe.issuer.name,
    p_recipient_document: nfe.recipient.document,
    p_recipient_name: nfe.recipient.name,
    p_invoice_total: nfe.total,
    p_fiscal_totals: nfe.fiscalTotals as unknown as Json,
    p_file_name: safeFileName,
    p_storage_path: storagePath,
    p_file_size: file.size,
    p_items: items as unknown as Json,
  });
  if (created.error) {
    const duplicate = /duplicate|já está|já foi/i.test(created.error.message);
    return {
      error: duplicate
        ? "Esta NF-e já foi importada ou já está vinculada a um recebimento."
        : `Não foi possível criar a importação: ${created.error.message}`,
      importId: null,
    };
  }

  const uploaded = await supabase.storage
    .from("historical-nfe-documents")
    .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
      contentType: "application/xml",
      cacheControl: "3600",
      upsert: false,
    });
  if (uploaded.error) {
    await supabase.rpc("rpc_discard_historical_nfe_import", {
      p_company_id: company.companyId,
      p_import_id: importId,
    });
    return {
      error: `Não foi possível guardar o XML: ${uploaded.error.message}`,
      importId: null,
    };
  }

  revalidatePath("/recebimentos/historico");
  return { error: null, importId };
}

function decimal(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : null;
}

export async function postHistoricalNfe(
  importId: string,
  _previous: HistoricalNfeActionState,
  formData: FormData,
): Promise<HistoricalNfeActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite confirmar o histórico fiscal." };
  }
  const supplierId = String(formData.get("supplierId") ?? "");
  const itemIds = [...new Set(formData.getAll("itemId").map(String))];
  if (!supplierId) return { error: "Associe a NF-e a um fornecedor." };
  if (!itemIds.length)
    return { error: "A NF-e não possui itens para conciliar." };

  const items: Json[] = [];
  for (const id of itemIds) {
    const ignored = formData.get(`ignored_${id}`) === "on";
    const notes = String(formData.get(`notes_${id}`) ?? "").trim();
    if (ignored) {
      if (!notes)
        return {
          error: "Informe por que o item ignorado não entrará no histórico.",
        };
      items.push({ id, ignored: true, notes });
      continue;
    }
    const productId = String(formData.get(`product_${id}`) ?? "");
    const quantity = decimal(formData.get(`quantity_${id}`));
    const price = decimal(formData.get(`price_${id}`));
    if (
      !productId ||
      quantity === null ||
      quantity <= 0 ||
      price === null ||
      price < 0
    ) {
      return {
        error:
          "Associe o produto e confira quantidade e preço em todos os itens.",
      };
    }
    items.push({
      id,
      ignored: false,
      product_id: productId,
      pricing_quantity: quantity,
      practiced_price: price,
      notes: notes || null,
    });
  }

  const supabase = await createServerSupabaseClient();
  const importResult = await supabase
    .from("historical_nfe_imports")
    .select("issuer_document, status")
    .eq("company_id", company.companyId)
    .eq("id", importId)
    .maybeSingle();
  if (
    importResult.error ||
    !importResult.data ||
    importResult.data.status !== "draft"
  ) {
    return { error: "Importação não encontrada ou já concluída." };
  }

  if (formData.get("adoptSupplierDocument") === "on") {
    const issuerDocument = cleanDocument(importResult.data.issuer_document);
    if (!permissions.has("supplier.update") || !isValidCnpj(issuerDocument)) {
      return {
        error: "Não foi possível usar o CNPJ da nota neste fornecedor.",
      };
    }
    const adopted = await supabase
      .from("suppliers")
      .update({ document_number: issuerDocument })
      .eq("company_id", company.companyId)
      .eq("id", supplierId)
      .is("document_number", null);
    if (adopted.error) {
      return {
        error:
          adopted.error.code === "23505"
            ? "O CNPJ da nota já pertence a outro fornecedor."
            : `Não foi possível atualizar o fornecedor: ${adopted.error.message}`,
      };
    }
  }

  const posted = await supabase.rpc("rpc_post_historical_nfe_import", {
    p_company_id: company.companyId,
    p_import_id: importId,
    p_supplier_id: supplierId,
    p_items: items,
  });
  if (posted.error) {
    return {
      error: `Não foi possível confirmar a importação: ${posted.error.message}`,
    };
  }

  revalidatePath("/recebimentos/historico");
  revalidatePath("/produtos", "layout");
  revalidatePath("/fornecedores", "layout");
  redirect("/recebimentos/historico");
}
