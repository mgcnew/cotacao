"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isValidCnpj } from "@/features/company/cnpj";
import {
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReceiptActionState = {
  error: string | null;
  savedAt?: number;
  receiptId?: string;
};

export type ReceiptNfeUploadState = {
  error: string | null;
  saved?: boolean;
  accessKey?: string;
};

export type ReceiptNfeAssistState = {
  error: string | null;
  message?: string;
  documentNumber?: string;
  rule?: {
    id: string;
    xmlUnit: string;
    targetUnit: string;
    mode: "fixed_factor" | "manual_quantity";
    factor: number | null;
  };
};

const XML_MAX_SIZE = 4 * 1024 * 1024;

function xmlSection(xml: string, tag: string) {
  const pattern = new RegExp(
    "<(?:[\\w.-]+:)?" +
      tag +
      "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?" +
      tag +
      ">",
    "i",
  );
  return pattern.exec(xml)?.[1] ?? null;
}

function xmlValue(xml: string, tag: string) {
  return (
    xmlSection(xml, tag)
      ?.replace(/<[^>]+>/g, "")
      .trim() || null
  );
}

function xmlDocument(section: string | null) {
  if (!section) return null;
  return (
    (xmlValue(section, "CNPJ") ?? xmlValue(section, "CPF"))?.replace(
      /\D/g,
      "",
    ) ?? null
  );
}

function xmlNumber(xml: string, tag: string) {
  const parsed = Number(xmlValue(xml, tag));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nfeFiscalTotals(info: string) {
  const totals = xmlSection(info, "ICMSTot");
  if (!totals) return null;
  const result = {
    products: xmlNumber(totals, "vProd"),
    freight: xmlNumber(totals, "vFrete"),
    insurance: xmlNumber(totals, "vSeg"),
    discount: xmlNumber(totals, "vDesc"),
    other: xmlNumber(totals, "vOutro"),
    importTax: xmlNumber(totals, "vII"),
    ipi: xmlNumber(totals, "vIPI"),
    returnedIpi: xmlNumber(totals, "vIPIDevol"),
    icmsSt: xmlNumber(totals, "vST"),
    fcpSt: xmlNumber(totals, "vFCPST"),
    monophaseRetainedIcms: xmlNumber(totals, "vICMSMonoReten"),
    services: xmlNumber(totals, "vServ"),
    desoneratedIcms: xmlNumber(totals, "vICMSDeson"),
    estimatedTaxes: xmlNumber(totals, "vTotTrib"),
    invoice: xmlNumber(totals, "vNF"),
  };
  const composedTotal =
    result.products -
    result.discount -
    result.desoneratedIcms +
    result.icmsSt +
    result.fcpSt +
    result.monophaseRetainedIcms +
    result.freight +
    result.insurance +
    result.other +
    result.importTax +
    result.ipi +
    result.returnedIpi +
    result.services;
  return {
    ...result,
    composedTotal,
    residual: result.invoice - composedTotal,
  };
}

export async function uploadReceiptNfe(
  formData: FormData,
): Promise<ReceiptNfeUploadState> {
  const company = await requireActiveCompany();
  const user = await requireUser();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite anexar a NF-e ao recebimento." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const file = formData.get("file");
  if (!receiptId || !(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo XML da NF-e." };
  }
  if (file.size > XML_MAX_SIZE) {
    return { error: "O XML deve ter no máximo 4 MB." };
  }
  if (!file.name.toLowerCase().endsWith(".xml")) {
    return { error: "O documento precisa ser um arquivo XML." };
  }

  const xml = await file.text();
  const info = xmlSection(xml, "infNFe");
  const protocol = xmlSection(xml, "infProt");
  const authorizationStatus = protocol ? xmlValue(protocol, "cStat") : null;
  if (
    !info ||
    !protocol ||
    !["100", "150"].includes(authorizationStatus ?? "")
  ) {
    return { error: "O XML não possui autorização de uso da NF-e." };
  }
  if (
    [...xml.matchAll(/<(?:[\w.-]+:)?tpEvento\b[^>]*>([^<]*)</gi)].some(
      (match) => match[1]?.trim() === "110111",
    )
  ) {
    return { error: "A NF-e possui evento de cancelamento." };
  }

  const accessKey =
    /\bId\s*=\s*["']NFe(\d{44})["']/i.exec(xml)?.[1] ??
    (protocol ? xmlValue(protocol, "chNFe") : null);
  if (!accessKey || !/^\d{44}$/.test(accessKey)) {
    return { error: "A chave de acesso da NF-e é inválida." };
  }

  const supabase = await createServerSupabaseClient();
  const [receiptResult, companyResult] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "id, status, orders!inner ( suppliers!inner ( document_number ) )",
      )
      .eq("company_id", company.companyId)
      .eq("id", receiptId)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("document_number")
      .eq("id", company.companyId)
      .maybeSingle(),
  ]);
  if (receiptResult.error || companyResult.error) {
    return { error: "Não foi possível validar o recebimento e a NF-e." };
  }
  if (!receiptResult.data || receiptResult.data.status !== "draft") {
    return { error: "A chegada não existe ou já foi conferida." };
  }

  const issuerDocument = xmlDocument(xmlSection(info, "emit"));
  const recipientDocument = xmlDocument(xmlSection(info, "dest"));
  const expectedRecipient = companyResult.data?.document_number?.replace(
    /\D/g,
    "",
  );
  const expectedIssuer =
    receiptResult.data.orders.suppliers.document_number?.replace(/\D/g, "");
  if (
    expectedRecipient &&
    recipientDocument &&
    expectedRecipient !== recipientDocument
  ) {
    return { error: "O destinatário da NF-e é diferente da empresa atual." };
  }
  if (
    expectedIssuer &&
    issuerDocument &&
    expectedIssuer.slice(0, 8) !== issuerDocument.slice(0, 8)
  ) {
    return { error: "O emitente da NF-e é diferente do fornecedor do pedido." };
  }
  const fiscalTotals = nfeFiscalTotals(info);
  if (!fiscalTotals) {
    return { error: "O XML não informou os totais fiscais da NF-e." };
  }

  const existing = await supabase
    .from("receipt_documents")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("receipt_id", receiptId)
    .eq("kind", "nfe_xml")
    .eq("access_key", accessKey)
    .maybeSingle();
  if (existing.error) {
    return {
      error: "Não foi possível consultar os anexos: " + existing.error.message,
    };
  }
  if (existing.data) {
    const savedTotals = await supabase.rpc("rpc_save_receipt_nfe_totals", {
      p_company_id: company.companyId,
      p_receipt_id: receiptId,
      p_totals: fiscalTotals,
    });
    if (savedTotals.error) {
      return {
        error:
          "O XML já estava anexado, mas os totais fiscais não puderam ser atualizados: " +
          savedTotals.error.message,
      };
    }
    return { error: null, saved: true, accessKey };
  }

  const storagePath =
    company.companyId + "/" + receiptId + "/" + accessKey + ".xml";
  const { error: uploadError } = await supabase.storage
    .from("receipt-documents")
    .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
      contentType: "application/xml",
      cacheControl: "3600",
      upsert: false,
    });
  const alreadyUploaded =
    uploadError && /already exists|duplicate/i.test(uploadError.message);
  if (uploadError && !alreadyUploaded) {
    return { error: "Não foi possível guardar o XML: " + uploadError.message };
  }

  const safeFileName =
    file.name.split(/[\\/]/).pop()?.trim().slice(0, 255) || accessKey + ".xml";
  const { error: metadataError } = await supabase
    .from("receipt_documents")
    .insert({
      company_id: company.companyId,
      receipt_id: receiptId,
      kind: "nfe_xml",
      access_key: accessKey,
      file_name: safeFileName,
      storage_path: storagePath,
      file_size: file.size,
      uploaded_by: user.id,
    });
  if (metadataError && !/duplicate/i.test(metadataError.message)) {
    if (!alreadyUploaded) {
      await supabase.storage.from("receipt-documents").remove([storagePath]);
    }
    return {
      error: "Não foi possível vincular o XML: " + metadataError.message,
    };
  }

  const savedTotals = await supabase.rpc("rpc_save_receipt_nfe_totals", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
    p_totals: fiscalTotals,
  });
  if (savedTotals.error) {
    return {
      error:
        "O XML foi anexado, mas os totais fiscais não puderam ser guardados: " +
        savedTotals.error.message,
    };
  }

  return { error: null, saved: true, accessKey };
}

export async function deleteReceiptNfe(
  formData: FormData,
): Promise<ReceiptNfeUploadState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite remover a NF-e do recebimento." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const accessKey = String(formData.get("accessKey") ?? "");
  if (!receiptId || !/^\d{44}$/.test(accessKey)) {
    return { error: "Não foi possível identificar o XML que será removido." };
  }

  const supabase = await createServerSupabaseClient();
  const document = await supabase
    .from("receipt_documents")
    .select("id, storage_path")
    .eq("company_id", company.companyId)
    .eq("receipt_id", receiptId)
    .eq("kind", "nfe_xml")
    .eq("access_key", accessKey)
    .maybeSingle();
  if (document.error) {
    return {
      error: "Não foi possível consultar o XML: " + document.error.message,
    };
  }
  if (!document.data) return { error: null, saved: false, accessKey };

  const storage = await supabase.storage
    .from("receipt-documents")
    .remove([document.data.storage_path]);
  if (storage.error) {
    return {
      error: "Não foi possível remover o XML: " + storage.error.message,
    };
  }

  const deletion = await supabase
    .from("receipt_documents")
    .delete()
    .eq("company_id", company.companyId)
    .eq("id", document.data.id);
  if (deletion.error) {
    return {
      error:
        "O arquivo foi removido, mas o vínculo não pôde ser limpo: " +
        deletion.error.message,
    };
  }
  const remaining = await supabase
    .from("receipt_documents")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .eq("receipt_id", receiptId)
    .eq("kind", "nfe_xml");
  if (!remaining.error && (remaining.count ?? 0) === 0) {
    await supabase.rpc("rpc_save_receipt_nfe_totals", {
      p_company_id: company.companyId,
      p_receipt_id: receiptId,
      p_totals: null,
    });
  }
  return { error: null, saved: false, accessKey };
}

export async function learnSupplierProductAlias(
  formData: FormData,
): Promise<ReceiptNfeAssistState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite associar produtos da NF-e." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const orderRevisionItemId = String(formData.get("orderRevisionItemId") ?? "");
  const supplierName = String(formData.get("supplierName") ?? "").trim();
  const supplierCode = String(formData.get("supplierCode") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!receiptId || !orderRevisionItemId || !supplierName) {
    return { error: "Informe qual produto do pedido corresponde ao item." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_learn_supplier_product_alias", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
    p_order_revision_item_id: orderRevisionItemId,
    p_supplier_name: supplierName,
    p_supplier_code: supplierCode || undefined,
    p_barcode: barcode || undefined,
  });
  if (error) {
    return { error: `Não foi possível guardar a associação: ${error.message}` };
  }

  revalidatePath(`/recebimentos/${receiptId}`);
  return {
    error: null,
    message:
      "Associação salva. As próximas notas deste fornecedor reconhecerão o produto.",
  };
}

export async function saveSupplierProductNfeUnitRule(
  formData: FormData,
): Promise<ReceiptNfeAssistState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite ensinar conversões da NF-e." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const orderRevisionItemId = String(formData.get("orderRevisionItemId") ?? "");
  const xmlUnit = String(formData.get("xmlUnit") ?? "")
    .trim()
    .toUpperCase();
  const targetKind = String(formData.get("targetKind") ?? "");
  const targetUnit = String(formData.get("targetUnit") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const rawFactor = String(formData.get("factor") ?? "")
    .trim()
    .replace(",", ".");
  const factor = rawFactor ? Number(rawFactor) : null;

  if (!receiptId || !orderRevisionItemId || !xmlUnit || !targetUnit) {
    return { error: "Informe a unidade da nota e a unidade de destino." };
  }
  if (!["purchase", "pricing"].includes(targetKind)) {
    return { error: "Destino da conversão inválido." };
  }
  if (!["fixed_factor", "manual_quantity"].includes(mode)) {
    return { error: "Escolha como a quantidade deve ser convertida." };
  }
  if (mode === "fixed_factor" && (!factor || !Number.isFinite(factor))) {
    return { error: "Informe quantas unidades existem na embalagem da nota." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_save_supplier_product_nfe_unit_rule",
    {
      p_company_id: company.companyId,
      p_receipt_id: receiptId,
      p_order_revision_item_id: orderRevisionItemId,
      p_xml_unit: xmlUnit,
      p_target_kind: targetKind,
      p_mode: mode,
      p_factor: mode === "fixed_factor" ? factor! : undefined,
    },
  );
  if (error) {
    return { error: `Não foi possível salvar a conversão: ${error.message}` };
  }

  revalidatePath(`/recebimentos/${receiptId}`);
  return {
    error: null,
    message:
      mode === "fixed_factor"
        ? `Conversão salva: 1 ${xmlUnit} = ${factor} ${targetUnit}.`
        : `Regra salva: a quantidade em ${targetUnit} deverá ser confirmada no recebimento.`,
    rule: {
      id: String(data),
      xmlUnit,
      targetUnit,
      mode: mode as "fixed_factor" | "manual_quantity",
      factor: mode === "fixed_factor" ? factor : null,
    },
  };
}

export async function adoptSupplierDocumentFromNfe(
  formData: FormData,
): Promise<ReceiptNfeAssistState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post") || !permissions.has("supplier.update")) {
    return {
      error: "Seu papel não permite atualizar o cadastro do fornecedor.",
    };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const accessKey = String(formData.get("accessKey") ?? "");
  if (!receiptId || !/^\d{44}$/.test(accessKey)) {
    return { error: "Não foi possível identificar a NF-e anexada." };
  }

  const supabase = await createServerSupabaseClient();
  const [documentResult, receiptResult] = await Promise.all([
    supabase
      .from("receipt_documents")
      .select("storage_path")
      .eq("company_id", company.companyId)
      .eq("receipt_id", receiptId)
      .eq("kind", "nfe_xml")
      .eq("access_key", accessKey)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select(
        "status, orders!inner ( supplier_id, suppliers!inner ( document_number ) )",
      )
      .eq("company_id", company.companyId)
      .eq("id", receiptId)
      .maybeSingle(),
  ]);
  if (documentResult.error || receiptResult.error) {
    return { error: "Não foi possível validar a NF-e e o fornecedor." };
  }
  if (!documentResult.data || !receiptResult.data) {
    return { error: "NF-e ou recebimento não encontrado." };
  }
  if (receiptResult.data.status !== "draft") {
    return { error: "A conferência já foi finalizada." };
  }
  if (receiptResult.data.orders.suppliers.document_number) {
    return { error: "O fornecedor já possui CNPJ cadastrado." };
  }

  const downloaded = await supabase.storage
    .from("receipt-documents")
    .download(documentResult.data.storage_path);
  if (downloaded.error || !downloaded.data) {
    return { error: "Não foi possível reler o XML armazenado." };
  }
  const xml = await downloaded.data.text();
  const info = xmlSection(xml, "infNFe");
  const issuerDocument = xmlDocument(info ? xmlSection(info, "emit") : null);
  if (!issuerDocument || !isValidCnpj(issuerDocument)) {
    return { error: "O XML não contém um CNPJ de emitente válido." };
  }

  const { data: updated, error: updateError } = await supabase
    .from("suppliers")
    .update({ document_number: issuerDocument })
    .eq("company_id", company.companyId)
    .eq("id", receiptResult.data.orders.supplier_id)
    .is("document_number", null)
    .select("id")
    .maybeSingle();
  if (updateError) {
    return {
      error:
        updateError.code === "23505"
          ? "Este CNPJ já pertence a outro fornecedor."
          : `Não foi possível atualizar o fornecedor: ${updateError.message}`,
    };
  }
  if (!updated) {
    return { error: "O fornecedor já foi atualizado por outra pessoa." };
  }

  revalidatePath(`/fornecedores/${updated.id}`);
  revalidatePath("/fornecedores");
  revalidatePath(`/recebimentos/${receiptId}`);
  return {
    error: null,
    message: "CNPJ da NF-e adicionado ao cadastro do fornecedor.",
    documentNumber: issuerDocument,
  };
}

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
  if (itemIds.length === 0) {
    return { error: "Este recebimento não possui produtos para conferir." };
  }
  const supabase = await createServerSupabaseClient();
  const revisionItems = await supabase
    .from("order_revision_items")
    .select("id, purchase_unit_id, pricing_unit_id")
    .eq("company_id", company.companyId)
    .in("id", itemIds);

  if (revisionItems.error) {
    return {
      error: `Não foi possível validar as unidades: ${revisionItems.error.message}`,
    };
  }

  const sameUnitIds = new Set(
    (revisionItems.data ?? [])
      .filter((item) => item.purchase_unit_id === item.pricing_unit_id)
      .map((item) => item.id),
  );
  const items: {
    order_revision_item_id: string;
    logistic_quantity_received: string;
    pricing_quantity_received: string;
    practiced_price: string;
    notes?: string;
  }[] = [];

  for (const id of itemIds) {
    const logistic = decimal(formData.get(`log_${id}`));
    const pricing = sameUnitIds.has(id)
      ? logistic
      : decimal(formData.get(`prec_${id}`));
    const price = decimal(formData.get(`preco_${id}`));
    const name = String(formData.get(`nome_${id}`) ?? "este item");
    if (
      formData.get(`manual_required_${id}`) === "1" &&
      formData.get(`manual_confirm_${id}`) !== "on"
    ) {
      return {
        error: `Em "${name}", confirme a quantidade física que não veio no XML.`,
      };
    }
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
