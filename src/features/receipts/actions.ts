"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";
import { getCompany } from "@/features/company/queries";
import { quickPricingQuantity } from "@/features/receipts/quick-receipt";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundedMoneyString, roundMoney } from "@/lib/money";

export type ReceiptActionState = {
  error: string | null;
  savedAt?: number;
  receiptId?: string;
};

export type ReceiptNfeUploadState = {
  error: string | null;
  saved?: boolean;
  accessKey?: string;
  issuerLinked?: boolean;
  issuerDocument?: string;
  issuerName?: string;
};

export type ReceiptNfeAssistState = {
  error: string | null;
  message?: string;
  documentNumber?: string;
  legalEntityId?: string;
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
      .select("id, status, orders!inner ( supplier_id )")
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

  const issuer = xmlSection(info, "emit");
  const recipient = xmlSection(info, "dest");
  const identification = xmlSection(info, "ide");
  const issuerDocument = xmlDocument(issuer);
  const issuerName = issuer ? xmlValue(issuer, "xNome") : null;
  const recipientDocument = xmlDocument(recipient);
  const recipientName = recipient ? xmlValue(recipient, "xNome") : null;
  const expectedRecipient = companyResult.data?.document_number?.replace(
    /\D/g,
    "",
  );
  if (
    expectedRecipient &&
    recipientDocument &&
    expectedRecipient !== recipientDocument
  ) {
    return { error: "O destinatário da NF-e é diferente da empresa atual." };
  }
  const fiscalTotals = nfeFiscalTotals(info);
  if (!fiscalTotals) {
    return { error: "O XML não informou os totais fiscais da NF-e." };
  }

  const knownIssuer = issuerDocument
    ? await supabase
        .from("supplier_legal_entities")
        .select("id, supplier_id, suppliers!inner ( name )")
        .eq("company_id", company.companyId)
        .eq("document_number", issuerDocument)
        .maybeSingle()
    : { data: null, error: null };
  if (knownIssuer.error) {
    return { error: "Não foi possível reconhecer a empresa emitente." };
  }
  if (
    knownIssuer.data &&
    knownIssuer.data.supplier_id !== receiptResult.data.orders.supplier_id
  ) {
    return {
      error: `O CNPJ desta NF-e já está vinculado ao fornecedor comercial "${knownIssuer.data.suppliers.name}".`,
    };
  }

  const existing = await supabase
    .from("receipt_documents")
    .select("id, supplier_legal_entity_id")
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
    const refreshedDocument = await supabase
      .from("receipt_documents")
      .update({
        supplier_legal_entity_id:
          knownIssuer.data?.id ?? existing.data.supplier_legal_entity_id,
        issuer_document: issuerDocument,
        issuer_name: issuerName,
        recipient_document: recipientDocument,
        recipient_name: recipientName,
        invoice_number: identification ? xmlValue(identification, "nNF") : null,
        invoice_series: identification
          ? xmlValue(identification, "serie")
          : null,
        issued_at: identification
          ? (xmlValue(identification, "dhEmi") ??
            xmlValue(identification, "dEmi"))
          : null,
        invoice_total: roundMoney(fiscalTotals.invoice),
        fiscal_totals: fiscalTotals,
      })
      .eq("company_id", company.companyId)
      .eq("id", existing.data.id);
    if (refreshedDocument.error) {
      return {
        error:
          "O XML já estava anexado, mas seus dados não puderam ser atualizados: " +
          refreshedDocument.error.message,
      };
    }
    const savedTotals = await supabase.rpc("rpc_refresh_receipt_nfe_totals", {
      p_company_id: company.companyId,
      p_receipt_id: receiptId,
    });
    if (savedTotals.error) {
      return {
        error:
          "O XML já estava anexado, mas os totais fiscais não puderam ser atualizados: " +
          savedTotals.error.message,
      };
    }
    return {
      error: null,
      saved: true,
      accessKey,
      issuerLinked: Boolean(
        knownIssuer.data?.id ?? existing.data.supplier_legal_entity_id,
      ),
      issuerDocument: issuerDocument ?? undefined,
      issuerName: issuerName ?? undefined,
    };
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
      supplier_legal_entity_id: knownIssuer.data?.id ?? null,
      issuer_document: issuerDocument,
      issuer_name: issuerName,
      recipient_document: recipientDocument,
      recipient_name: recipientName,
      invoice_number: identification ? xmlValue(identification, "nNF") : null,
      invoice_series: identification ? xmlValue(identification, "serie") : null,
      issued_at: identification
        ? (xmlValue(identification, "dhEmi") ??
          xmlValue(identification, "dEmi"))
        : null,
      invoice_total: roundMoney(fiscalTotals.invoice),
      fiscal_totals: fiscalTotals,
    });
  if (metadataError && !/duplicate/i.test(metadataError.message)) {
    if (!alreadyUploaded) {
      await supabase.storage.from("receipt-documents").remove([storagePath]);
    }
    return {
      error: "Não foi possível vincular o XML: " + metadataError.message,
    };
  }

  const savedTotals = await supabase.rpc("rpc_refresh_receipt_nfe_totals", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
  });
  if (savedTotals.error) {
    return {
      error:
        "O XML foi anexado, mas os totais fiscais não puderam ser guardados: " +
        savedTotals.error.message,
    };
  }

  return {
    error: null,
    saved: true,
    accessKey,
    issuerLinked: Boolean(knownIssuer.data),
    issuerDocument: issuerDocument ?? undefined,
    issuerName: issuerName ?? undefined,
  };
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
    .select("id, storage_path, storage_bucket, historical_import_id")
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

  if (document.data.historical_import_id) {
    const restored = await supabase.rpc(
      "rpc_restore_transferred_historical_nfe",
      {
        p_company_id: company.companyId,
        p_receipt_id: receiptId,
        p_access_key: accessKey,
      },
    );
    if (restored.error) {
      return {
        error:
          "Não foi possível devolver a NF-e ao histórico: " +
          restored.error.message,
      };
    }
    revalidatePath("/recebimentos/historico");
    return { error: null, saved: false, accessKey };
  }

  const storage = await supabase.storage
    .from(document.data.storage_bucket)
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
  await supabase.rpc("rpc_refresh_receipt_nfe_totals", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
  });
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

/**
 * Desfaz o que foi aprendido para uma descrição da NF-e.
 *
 * Associar é escrever uma regra: a próxima nota do fornecedor casa sozinha,
 * com confiança máxima. Quando a regra nasce errada, desfazer a linha desta
 * conferência não basta — sem apagar a memória, o próximo XML refaz o engano
 * sem perguntar.
 */
export async function forgetSupplierProductAlias(
  formData: FormData,
): Promise<ReceiptNfeAssistState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite desfazer associações da NF-e." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const supplierName = String(formData.get("supplierName") ?? "").trim();
  const supplierCode = String(formData.get("supplierCode") ?? "").trim();
  if (!receiptId || !supplierName) {
    return { error: "Informe qual item da nota deve ser desassociado." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_forget_supplier_product_alias",
    {
      p_company_id: company.companyId,
      p_receipt_id: receiptId,
      p_supplier_name: supplierName,
      p_supplier_code: supplierCode || undefined,
    },
  );
  if (error) {
    return { error: `Não foi possível desfazer a associação: ${error.message}` };
  }

  revalidatePath(`/recebimentos/${receiptId}`);
  return {
    error: null,
    message: data
      ? "Associação desfeita. As próximas notas deste fornecedor voltam a perguntar qual é o produto."
      : "Associação desfeita nesta conferência.",
  };
}

/**
 * Acrescenta ao pedido um produto que veio na nota e não estava nele.
 *
 * O `orderId` sai do recebimento, não do cliente: quem recebe a nota não
 * escolhe em qual pedido o item entra.
 *
 * A permissão pedida é `order.revise`, e não `receipt.post` — o que muda aqui
 * é o pedido, não o recebimento. Conferir mercadoria e reescrever o que foi
 * comprado são autoridades diferentes.
 */
export async function addInvoiceItemToOrder(
  formData: FormData,
): Promise<ReceiptNfeAssistState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("order.revise")) {
    return {
      error: "Seu papel não permite acrescentar itens ao pedido.",
    };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  // Vírgula decimal e ponto de milhar, que é como se digita em português.
  const decimal = (campo: string) =>
    Number(
      String(formData.get(campo) ?? "")
        .replace(/\./g, "")
        .replace(",", "."),
    );
  const quantity = decimal("quantity");
  const price = decimal("price");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!receiptId || !productId) {
    return { error: "Escolha o produto do catálogo que corresponde ao item." };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Informe a quantidade recebida." };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Informe o preço da nota." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .select("order_id")
    .eq("company_id", company.companyId)
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError) {
    return { error: `Não foi possível ler o recebimento: ${receiptError.message}` };
  }
  if (!receipt) return { error: "Recebimento não encontrado." };

  const { error } = await supabase.rpc("rpc_add_invoice_item_to_order", {
    p_company_id: company.companyId,
    p_order_id: receipt.order_id,
    p_product_id: productId,
    p_quantity: quantity,
    p_price: price,
    p_notes: notes || undefined,
  });

  if (error) {
    return { error: `Não foi possível acrescentar ao pedido: ${error.message}` };
  }

  revalidatePath(`/recebimentos/${receiptId}`);
  revalidatePath(`/pedidos/${receipt.order_id}`);
  revalidatePath("/pedidos");
  return {
    error: null,
    message:
      "Item acrescentado ao pedido, numa revisão confirmada pela própria nota.",
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

export async function linkReceiptIssuerFromNfe(
  formData: FormData,
): Promise<ReceiptNfeAssistState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite vincular a empresa emitente." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const accessKey = String(formData.get("accessKey") ?? "");
  const adoptAsPrimary = formData.get("adoptAsPrimary") === "on";
  if (!receiptId || !/^\d{44}$/.test(accessKey)) {
    return { error: "Não foi possível identificar a NF-e." };
  }
  if (adoptAsPrimary && !permissions.has("supplier.update")) {
    return {
      error: "Seu papel não permite alterar a empresa principal do fornecedor.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_link_receipt_issuer", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
    p_access_key: accessKey,
    p_adopt_as_primary: adoptAsPrimary,
  });
  if (error) {
    return {
      error: `Não foi possível vincular a empresa emitente: ${error.message}`,
    };
  }

  revalidatePath(`/recebimentos/${receiptId}`);
  revalidatePath("/fornecedores", "layout");
  return {
    error: null,
    legalEntityId: String(data),
    message: adoptAsPrimary
      ? "Empresa emitente vinculada e definida como principal."
      : "Empresa emitente vinculada. As próximas NF-e serão reconhecidas automaticamente.",
  };
}

function decimal(value: FormDataEntryValue | null): string {
  return String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
}

function moneyDecimal(value: FormDataEntryValue | null): string {
  const normalized = decimal(value);
  return normalized ? roundedMoneyString(normalized) : "";
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
  const invoiceTotal = moneyDecimal(formData.get("invoiceTotal"));
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
    practiced_price?: string;
    price_unverified?: boolean;
    receipt_access_key?: string;
    notes?: string;
  }[] = [];

  for (const id of itemIds) {
    const logistic = decimal(formData.get(`log_${id}`));
    const pricing = sameUnitIds.has(id)
      ? logistic
      : decimal(formData.get(`prec_${id}`));
    // "Sem a nota agora": o item entra com o preço negociado, marcado como
    // não conferido, e o preço real é confirmado depois, quando a nota chegar.
    const semNota = formData.get(`semnota_${id}`) === "on";
    const price = semNota ? "" : moneyDecimal(formData.get(`preco_${id}`));
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
    // Preço muito distante do combinado costuma ser linha da nota associada ao
    // produto errado. O que aqui passa vira histórico do produto e referência
    // de preço do fornecedor, então precisa de um olho humano dizendo que é.
    if (
      formData.get(`assoc_required_${id}`) === "1" &&
      formData.get(`assoc_confirm_${id}`) !== "on"
    ) {
      return {
        error: `Em "${name}", confirme que a linha da nota é mesmo deste produto ou desfaça a associação.`,
      };
    }
    if (!logistic || !pricing || (!semNota && !price)) {
      return {
        error: semNota
          ? `Em "${name}", preencha quantidade recebida e quantidade de precificação.`
          : `Em "${name}", preencha quantidade recebida, quantidade de precificação e preço da nota.`,
      };
    }
    if (
      ![logistic, pricing, ...(semNota ? [] : [price])].every(
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
      ...(semNota
        ? { price_unverified: true }
        : { practiced_price: price }),
      receipt_access_key:
        String(formData.get(`xml_${id}`) ?? "").trim() || undefined,
      notes: String(formData.get(`obs_${id}`) ?? "").trim() || undefined,
    });
  }

  if (items.length === 0) {
    return { error: "Informe ao menos um produto recebido." };
  }

  const invoiceTotal = moneyDecimal(formData.get("invoiceTotal"));
  if (
    invoiceTotal &&
    (!Number.isFinite(Number(invoiceTotal)) || Number(invoiceTotal) < 0)
  ) {
    return { error: "Valor total da nota inválido." };
  }

  const { error } = await supabase.rpc(
    "rpc_post_draft_receipt_with_documents",
    {
      p_company_id: company.companyId,
      p_receipt_id: receiptId,
      p_items: items,
      p_invoice_number:
        String(formData.get("invoiceNumber") ?? "").trim() || undefined,
      p_invoice_series:
        String(formData.get("invoiceSeries") ?? "").trim() || undefined,
      p_invoice_total: invoiceTotal ? Number(invoiceTotal) : undefined,
      p_notes: String(formData.get("notes") ?? "").trim() || undefined,
    },
  );

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite finalizar a conferência." };
    }
    if (error.message.includes("já conferida")) {
      return { error: "Esta chegada já foi conferida por outra pessoa." };
    }
    // O banco antigo não conhece `price_unverified` e recusa o item sem preço.
    if (
      error.message.includes("Dados inválidos") &&
      items.some((item) => item.price_unverified)
    ) {
      return {
        error:
          "Falta aplicar a migration 0120 no banco para conferir itens sem nota.",
      };
    }
    return { error: `Não foi possível finalizar: ${error.message}` };
  }

  revalidatePath("/recebimentos");
  revalidatePath(`/recebimentos/${receiptId}`);
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  redirect("/recebimentos");
}

/**
 * "Chegou conforme pedido": registra a chegada e dá a baixa de todo o saldo em
 * um passo, com o preço de cada item marcado como "a confirmar".
 *
 * Existe para o pedido que chegou e não pôde ser conferido no dia — a nota não
 * estava em mãos. Em vez de digitar um preço que talvez não seja o real, o
 * saldo é baixado e o preço fica pendente de confirmação, visível na lista de
 * Recebimentos até a nota aparecer.
 *
 * As quantidades são recalculadas aqui, do banco: o que o navegador mostrou
 * não é fonte de verdade. Se algum item não tiver quantidade de precificação
 * conhecida, nada é gravado e a pessoa é mandada à conferência normal.
 */
export async function receiveOrderAsOrdered(
  _previous: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.create") || !permissions.has("receipt.post")) {
    return { error: "Seu papel não permite dar entrada neste pedido." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const day = String(formData.get("receivedDay") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) {
    return { error: "Informe o dia em que a mercadoria chegou." };
  }
  const { timezone } = await getCompany(company.companyId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
  if (day > today) {
    return { error: "O dia de chegada não pode ser no futuro." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `
      id,
      status,
      current_revision:order_revisions!orders_current_revision_fk (
        order_revision_items (
          id,
          requested_quantity,
          purchase_unit_id,
          pricing_unit_id,
          estimated_pricing_quantity,
          receipt_items ( logistic_quantity_received )
        )
      ),
      receipts ( id, status )
    `,
    )
    .eq("company_id", company.companyId)
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return { error: `Não foi possível ler o pedido: ${orderError.message}` };
  }
  if (!order) return { error: "Pedido não encontrado." };
  if (order.status !== "awaiting_delivery" && order.status !== "partially_received") {
    return { error: "Este pedido não está aguardando entrega." };
  }
  if ((order.receipts ?? []).some((receipt) => receipt.status === "draft")) {
    return {
      error: "Este pedido já tem uma chegada aguardando conferência.",
    };
  }

  const items: {
    order_revision_item_id: string;
    logistic_quantity_received: number;
    pricing_quantity_received: number;
    price_unverified: true;
  }[] = [];
  for (const item of order.current_revision?.order_revision_items ?? []) {
    const requested = Number(item.requested_quantity);
    const received = (item.receipt_items ?? []).reduce(
      (sum, receiptItem) => sum + Number(receiptItem.logistic_quantity_received),
      0,
    );
    const pending = Math.max(requested - received, 0);
    if (pending <= 0) continue;
    const pricing = quickPricingQuantity({
      sameUnit: item.purchase_unit_id === item.pricing_unit_id,
      requestedQuantity: requested,
      pendingQuantity: pending,
      estimatedPricingQuantity:
        item.estimated_pricing_quantity === null
          ? null
          : Number(item.estimated_pricing_quantity),
    });
    if (pricing === null) {
      return {
        error:
          "Há itens em unidades diferentes sem quantidade estimada. Use “Conferir” para informar o que chegou.",
      };
    }
    items.push({
      order_revision_item_id: item.id,
      logistic_quantity_received: pending,
      pricing_quantity_received: pricing,
      price_unverified: true,
    });
  }
  if (items.length === 0) {
    return { error: "Este pedido não tem saldo a receber." };
  }

  // Meio-dia em Brasília: o dia escolhido é o dia que aparece, sem virar para o
  // anterior ou o seguinte por causa do fuso.
  const receivedAt = new Date(`${day}T15:00:00Z`).toISOString();
  const arrival = await supabase.rpc("rpc_register_order_arrival", {
    p_company_id: company.companyId,
    p_order_id: orderId,
    p_received_at: receivedAt,
    p_notes: "Baixa sem nota: preços a confirmar.",
  });
  if (arrival.error) {
    return {
      error: arrival.error.message.includes("já possui uma chegada")
        ? "Este pedido já está aguardando conferência."
        : `Não foi possível registrar a chegada: ${arrival.error.message}`,
    };
  }
  const receiptId = (arrival.data as { receipt_id?: string } | null)?.receipt_id;
  if (!receiptId) return { error: "A chegada foi registrada sem identificador." };

  const posted = await supabase.rpc("rpc_post_draft_receipt_with_documents", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
    p_items: items,
  });
  if (posted.error) {
    revalidatePath("/recebimentos");
    return {
      error: posted.error.message.includes("price_unverified")
        ? "Falta aplicar a migration 0120 no banco para dar baixa sem nota."
        : `A chegada foi registrada, mas a baixa falhou: ${posted.error.message}. Finalize em “Conferir agora”.`,
    };
  }

  revalidatePath("/recebimentos");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now(), receiptId };
}

/**
 * Grava os preços reais de itens que foram recebidos sem nota.
 *
 * Aceita confirmação parcial: o que estiver em branco continua pendente. Preço
 * muito distante do combinado precisa de um "confere" explícito, porque o que
 * passa aqui vira histórico do produto e referência de preço do fornecedor.
 */
export async function confirmReceiptPrices(
  _previous: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.post")) {
    return { error: "Seu papel não permite confirmar preços." };
  }

  const receiptId = String(formData.get("receiptId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const itemIds = [...new Set(formData.getAll("itemId").map(String))];

  const supabase = await createServerSupabaseClient();
  const agreed = await supabase
    .from("receipt_items")
    .select(
      "id, order_revision_items!inner ( agreed_price, product_name_snapshot, purchase_unit_id, pricing_unit_id )",
    )
    .eq("company_id", company.companyId)
    .eq("receipt_id", receiptId)
    .in("id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);
  if (agreed.error) {
    return { error: `Não foi possível validar os preços: ${agreed.error.message}` };
  }
  const reference = new Map(
    (agreed.data ?? []).map((row) => [row.id, row.order_revision_items]),
  );

  const items: {
    receipt_item_id: string;
    practiced_price: string;
    pricing_quantity_received?: string;
  }[] = [];
  for (const id of itemIds) {
    const price = moneyDecimal(formData.get(`preco_${id}`));
    if (!price) continue;
    const ref = reference.get(id);
    const name = ref?.product_name_snapshot ?? "este item";
    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return { error: `Preço inválido em "${name}".` };
    }
    const negotiated = Number(ref?.agreed_price ?? 0);
    const far =
      negotiated > 0 &&
      (Number(price) / negotiated > 3 || Number(price) / negotiated < 1 / 3);
    if (far && formData.get(`confere_${id}`) !== "on") {
      return {
        error: `Em "${name}", o preço está muito distante do combinado. Confira e marque “Confere” para seguir.`,
      };
    }
    const sameUnit = ref?.purchase_unit_id === ref?.pricing_unit_id;
    const pricing = sameUnit ? "" : decimal(formData.get(`prec_${id}`));
    if (pricing && (!Number.isFinite(Number(pricing)) || Number(pricing) < 0)) {
      return { error: `Quantidade de precificação inválida em "${name}".` };
    }
    items.push({
      receipt_item_id: id,
      practiced_price: price,
      ...(pricing ? { pricing_quantity_received: pricing } : {}),
    });
  }
  if (items.length === 0) {
    return { error: "Informe o preço de ao menos um produto." };
  }

  const invoiceTotal = moneyDecimal(formData.get("invoiceTotal"));
  const { error } = await supabase.rpc("rpc_confirm_receipt_prices", {
    p_company_id: company.companyId,
    p_receipt_id: receiptId,
    p_items: items,
    p_invoice_number:
      String(formData.get("invoiceNumber") ?? "").trim() || undefined,
    p_invoice_series:
      String(formData.get("invoiceSeries") ?? "").trim() || undefined,
    p_invoice_total: invoiceTotal ? Number(invoiceTotal) : undefined,
  });
  if (error) {
    if (error.message.includes("Could not find the function")) {
      return { error: "Falta aplicar a migration 0120 no banco." };
    }
    return { error: `Não foi possível confirmar os preços: ${error.message}` };
  }

  revalidatePath("/recebimentos");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  revalidatePath("/dashboard");
  revalidatePath("/produtos", "layout");
  revalidatePath("/fornecedores", "layout");
  return { error: null, savedAt: Date.now(), receiptId };
}
