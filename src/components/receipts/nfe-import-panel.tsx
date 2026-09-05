"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Link2,
  Scale,
  Upload,
  X,
} from "lucide-react";
import * as React from "react";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  deleteReceiptNfe,
  learnSupplierProductAlias,
  linkReceiptIssuerFromNfe,
  saveSupplierProductNfeUnitRule,
  uploadReceiptNfe,
} from "@/features/receipts/actions";
import {
  digits,
  matchNfeItem,
  nfePriceForUnit,
  nfeQuantityForUnit,
  normalizedNfeUnit,
  parseNfeXml,
  type NfeItem,
  type NfeItemMatch,
  type ParsedNfe,
} from "@/features/receipts/nfe";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const XML_MAX_SIZE = 4 * 1024 * 1024;

export type NfeOrderItemForImport = {
  id: string;
  productName: string;
  pendingQuantity: number;
  agreedPrice: number;
  purchaseUnit: string;
  pricingUnit: string;
  sameUnit: boolean;
  barcodes: string[];
  aliases: {
    supplierCode: string | null;
    supplierName: string;
    barcode: string | null;
  }[];
  unitRules: NfeUnitRule[];
};

export type NfeUnitRule = {
  id: string;
  xmlUnit: string;
  targetUnit: string;
  mode: "fixed_factor" | "manual_quantity";
  factor: number | null;
};

export type ImportedNfeItem = {
  logisticQuantity: number | null;
  pricingQuantity: number | null;
  practicedPrice: number | null;
  xmlItems: NfeItem[];
  match: NfeItemMatch;
  warnings: string[];
  conversionNotes: string[];
  manualConfirmationRequired: boolean;
  receiptAccessKey: string;
};

export type ImportedNfeDocument = {
  fileName: string;
  nfe: ParsedNfe;
  issuerLinked: boolean;
};

export type SourcedNfeItem = NfeItem & { receiptAccessKey: string };

export type NfeImportPayload = {
  fileName: string;
  nfe: ParsedNfe;
  documents: ImportedNfeDocument[];
  items: Record<string, ImportedNfeItem>;
  unmatched: SourcedNfeItem[];
  warnings: string[];
};

type ConversionDraft = {
  xmlUnit: string;
  mode: "fixed_factor" | "manual_quantity";
  factor: string;
};

const FISCAL_TOTAL_KEYS = [
  "products",
  "freight",
  "insurance",
  "discount",
  "other",
  "importTax",
  "ipi",
  "returnedIpi",
  "icmsSt",
  "fcpSt",
  "monophaseRetainedIcms",
  "services",
  "desoneratedIcms",
  "estimatedTaxes",
  "invoice",
  "composedTotal",
  "residual",
] as const;

function aggregateNfeDocuments(documents: ImportedNfeDocument[]): ParsedNfe {
  const first = documents[0].nfe;
  const fiscalTotals = { ...first.fiscalTotals };
  for (const key of FISCAL_TOTAL_KEYS) {
    fiscalTotals[key] = documents.reduce(
      (sum, document) => sum + document.nfe.fiscalTotals[key],
      0,
    );
  }
  return {
    ...first,
    accessKey: documents.length === 1 ? first.accessKey : null,
    number: documents.map((document) => document.nfe.number).join(", "),
    series: null,
    issuer: {
      document: null,
      name:
        documents.length === 1
          ? first.issuer.name
          : `${documents.length} empresas emitentes`,
    },
    total: fiscalTotals.invoice,
    fiscalTotals,
    items: documents.flatMap((document) => document.nfe.items),
  };
}

function payloadWithoutDocument(
  payload: NfeImportPayload,
  accessKey: string,
): NfeImportPayload | null {
  const documents = payload.documents.filter(
    (document) => document.nfe.accessKey !== accessKey,
  );
  if (!documents.length) return null;
  return {
    ...payload,
    fileName: documents.map((document) => document.fileName).join(", "),
    nfe: aggregateNfeDocuments(documents),
    documents,
    items: Object.fromEntries(
      Object.entries(payload.items).filter(
        ([, item]) => item.receiptAccessKey !== accessKey,
      ),
    ),
    unmatched: payload.unmatched.filter(
      (item) => item.receiptAccessKey !== accessKey,
    ),
    warnings: payload.warnings.filter(
      (warning) => !warning.startsWith(`[${accessKey}]`),
    ),
  };
}

function formatDocument(document: string | null) {
  if (!document) return "não informado";
  if (document.length === 14) {
    return document.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  return document;
}

function quantityForXmlUnit(item: NfeItem, unit: string) {
  const wanted = normalizedNfeUnit(unit);
  if (wanted === normalizedNfeUnit(item.commercialUnit)) {
    return item.commercialQuantity;
  }
  if (wanted === normalizedNfeUnit(item.tributaryUnit)) {
    return item.tributaryQuantity;
  }
  return null;
}

function convertedQuantity(
  xmlItems: NfeItem[],
  targetUnit: string,
  rules: NfeUnitRule[],
  pendingQuantity: number,
) {
  for (const rule of rules) {
    if (normalizedNfeUnit(rule.targetUnit) !== normalizedNfeUnit(targetUnit)) {
      continue;
    }
    const sourceValues = xmlItems.map((item) =>
      quantityForXmlUnit(item, rule.xmlUnit),
    );
    if (!sourceValues.every((value): value is number => value !== null)) {
      continue;
    }
    const sourceQuantity = sourceValues.reduce((sum, value) => sum + value, 0);
    if (rule.mode === "manual_quantity") {
      return {
        quantity: pendingQuantity,
        note: `A NF-e informa ${QTY.format(sourceQuantity)} ${rule.xmlUnit}; confirme abaixo a quantidade física em ${targetUnit}.`,
        manual: true,
      };
    }
    if (rule.factor && rule.factor > 0) {
      const quantity = sourceQuantity * rule.factor;
      return {
        quantity,
        note: `${QTY.format(sourceQuantity)} ${rule.xmlUnit} × ${QTY.format(rule.factor)} = ${QTY.format(quantity)} ${targetUnit}.`,
        manual: false,
      };
    }
  }
  return null;
}

export function importedItemValues(
  xmlItems: NfeItem[],
  orderItem: NfeOrderItemForImport,
) {
  const logisticValues = xmlItems.map((xmlItem) =>
    nfeQuantityForUnit(xmlItem, orderItem.purchaseUnit),
  );
  const pricingValues = xmlItems.map((xmlItem) =>
    nfeQuantityForUnit(xmlItem, orderItem.pricingUnit),
  );
  const warnings: string[] = [];
  const conversionNotes: string[] = [];
  let manualConfirmationRequired = false;

  let logisticQuantity = logisticValues.every(
    (quantity): quantity is number => quantity !== null,
  )
    ? logisticValues.reduce((sum, quantity) => sum + quantity, 0)
    : null;
  let pricingQuantity = pricingValues.every(
    (quantity): quantity is number => quantity !== null,
  )
    ? pricingValues.reduce((sum, quantity) => sum + quantity, 0)
    : null;

  if (logisticQuantity === null) {
    const converted = convertedQuantity(
      xmlItems,
      orderItem.purchaseUnit,
      orderItem.unitRules,
      orderItem.pendingQuantity,
    );
    if (converted) {
      logisticQuantity = converted.quantity;
      conversionNotes.push(converted.note);
      manualConfirmationRequired = converted.manual;
    }
  }
  if (pricingQuantity === null && !orderItem.sameUnit) {
    const converted = convertedQuantity(
      xmlItems,
      orderItem.pricingUnit,
      orderItem.unitRules.filter((rule) => rule.mode === "fixed_factor"),
      orderItem.pendingQuantity,
    );
    if (converted) {
      pricingQuantity = converted.quantity;
      conversionNotes.push(converted.note);
    }
  }

  if (orderItem.sameUnit && logisticQuantity !== null) {
    pricingQuantity = logisticQuantity;
  } else if (!orderItem.sameUnit) {
    if (logisticQuantity === null) {
      warnings.push(
        "A nota não informa quantidade na unidade de compra " +
          orderItem.purchaseUnit +
          ".",
      );
    }
    if (pricingQuantity === null) {
      warnings.push(
        "A nota não informa quantidade na unidade de preço " +
          orderItem.pricingUnit +
          ".",
      );
    }
  }

  const itemTotal = xmlItems.reduce(
    (sum, xmlItem) => sum + Math.max(xmlItem.total - xmlItem.discount, 0),
    0,
  );
  let practicedPrice =
    pricingQuantity && pricingQuantity > 0 ? itemTotal / pricingQuantity : null;
  if (practicedPrice === null) {
    const prices = xmlItems.map((xmlItem) =>
      nfePriceForUnit(xmlItem, orderItem.pricingUnit),
    );
    if (prices.every((price): price is number => price !== null)) {
      practicedPrice = prices[0] ?? null;
    }
  }

  if (practicedPrice === null) {
    warnings.push("Confira manualmente o preço por unidade de precificação.");
  } else if (Math.abs(practicedPrice - orderItem.agreedPrice) > 0.005) {
    warnings.push(
      "Preço da nota " +
        MONEY.format(practicedPrice) +
        " diferente do combinado " +
        MONEY.format(orderItem.agreedPrice) +
        ".",
    );
  }
  if (
    logisticQuantity !== null &&
    logisticQuantity - orderItem.pendingQuantity > 0.000001
  ) {
    warnings.push(
      "Quantidade " +
        QTY.format(logisticQuantity) +
        " acima do saldo pendente " +
        QTY.format(orderItem.pendingQuantity) +
        ".",
    );
  }

  if (orderItem.sameUnit && logisticQuantity === null) {
    warnings.push(
      `Configure como a unidade da nota vira ${orderItem.purchaseUnit}; nenhuma quantidade foi presumida.`,
    );
  }

  return {
    logisticQuantity,
    pricingQuantity,
    practicedPrice,
    warnings,
    conversionNotes,
    manualConfirmationRequired,
  };
}

export function NfeImportPanel({
  receiptId,
  items,
  companyDocument,
  supplierDocument,
  canUpdateSupplier,
  existingDocuments,
  value,
  onChange,
}: {
  receiptId: string;
  items: NfeOrderItemForImport[];
  companyDocument: string | null;
  supplierDocument: string | null;
  canUpdateSupplier: boolean;
  existingDocuments: {
    id: string;
    fileName: string;
    downloadUrl: string | null;
  }[];
  value: NfeImportPayload | null;
  onChange: (payload: NfeImportPayload | null) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const [removingAccessKey, setRemovingAccessKey] = React.useState<
    string | null
  >(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [associationSelections, setAssociationSelections] = React.useState<
    Record<string, string>
  >({});
  const [associatingLine, setAssociatingLine] = React.useState<string | null>(
    null,
  );
  const [linkingAccessKey, setLinkingAccessKey] = React.useState<
    string | null
  >(null);
  const [hasPrimarySupplierDocument, setHasPrimarySupplierDocument] =
    React.useState(Boolean(supplierDocument));
  const [conversionDrafts, setConversionDrafts] = React.useState<
    Record<string, ConversionDraft>
  >({});
  const [savingConversion, setSavingConversion] = React.useState<string | null>(
    null,
  );
  const [unitRuleOverrides, setUnitRuleOverrides] = React.useState<
    Record<string, NfeUnitRule[]>
  >({});
  const inputId = React.useId();

  function itemWithCurrentRules(item: NfeOrderItemForImport) {
    return {
      ...item,
      unitRules: unitRuleOverrides[item.id] ?? item.unitRules,
    };
  }

  function sourceUnits(xmlItems: NfeItem[]) {
    return [
      ...new Set(
        xmlItems
          .flatMap((item) => [item.commercialUnit, item.tributaryUnit])
          .map(normalizedNfeUnit)
          .filter(Boolean),
      ),
    ];
  }

  async function saveConversion(
    orderItem: NfeOrderItemForImport,
    imported: ImportedNfeItem,
    targetKind: "purchase" | "pricing",
  ) {
    if (!value) return;
    const key = `${orderItem.id}:${targetKind}`;
    const availableUnits = sourceUnits(imported.xmlItems);
    const draft = conversionDrafts[key] ?? {
      xmlUnit: availableUnits[0] ?? "",
      mode: "fixed_factor",
      factor: "",
    };
    const targetUnit =
      targetKind === "purchase"
        ? orderItem.purchaseUnit
        : orderItem.pricingUnit;
    setSavingConversion(key);
    setError(null);
    setMessage(null);
    const data = new FormData();
    data.set("receiptId", receiptId);
    data.set("orderRevisionItemId", orderItem.id);
    data.set("xmlUnit", draft.xmlUnit);
    data.set("targetKind", targetKind);
    data.set("targetUnit", targetUnit);
    data.set("mode", draft.mode);
    if (draft.factor) data.set("factor", draft.factor);
    const result = await saveSupplierProductNfeUnitRule(data);
    if (result.error || !result.rule) {
      setError(result.error ?? "Não foi possível salvar a conversão.");
      setSavingConversion(null);
      return;
    }
    const currentItem = itemWithCurrentRules(orderItem);
    const nextRules = [
      ...currentItem.unitRules.filter(
        (rule) =>
          !(
            normalizedNfeUnit(rule.xmlUnit) ===
              normalizedNfeUnit(result.rule!.xmlUnit) &&
            normalizedNfeUnit(rule.targetUnit) ===
              normalizedNfeUnit(result.rule!.targetUnit)
          ),
      ),
      result.rule,
    ];
    const recomputed = importedItemValues(imported.xmlItems, {
      ...currentItem,
      unitRules: nextRules,
    });
    onChange({
      ...value,
      items: {
        ...value.items,
        [orderItem.id]: { ...imported, ...recomputed },
      },
    });
    setUnitRuleOverrides((current) => ({
      ...current,
      [orderItem.id]: nextRules,
    }));
    setMessage(result.message ?? "Conversão salva.");
    setSavingConversion(null);
  }

  function conversionEditor(
    orderItem: NfeOrderItemForImport,
    imported: ImportedNfeItem,
    targetKind: "purchase" | "pricing",
  ) {
    const key = `${orderItem.id}:${targetKind}`;
    const units = sourceUnits(imported.xmlItems);
    const fallback: ConversionDraft = {
      xmlUnit: units[0] ?? "",
      mode: "fixed_factor",
      factor: "",
    };
    const draft = conversionDrafts[key] ?? fallback;
    const targetUnit =
      targetKind === "purchase"
        ? orderItem.purchaseUnit
        : orderItem.pricingUnit;
    return (
      <div
        key={key}
        className="border-warning/40 bg-warning/5 rounded-lg border p-3"
      >
        <p className="text-fg text-sm font-medium">
          Ensinar conversão para {orderItem.productName}
        </p>
        <p className="text-fg-muted mt-1 text-xs">
          A nota usa outra unidade. Salve uma vez e as próximas notas deste
          fornecedor usarão a mesma regra.
        </p>
        {orderItem.sameUnit ? (
          <p className="text-fg-muted mt-1 text-xs">
            Se este produto tiver peso variável, configure no cadastro uma
            unidade de compra física e outra unidade de preço (por exemplo, UN e
            KG).
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_minmax(12rem,1fr)_10rem_auto] sm:items-end">
          <div>
            <label className="text-fg-muted mb-1 block text-xs">
              Unidade na nota
            </label>
            <ThemedSelect
              id={`conversion-source-${key}`}
              value={draft.xmlUnit}
              onValueChange={(xmlUnit) =>
                setConversionDrafts((current) => ({
                  ...current,
                  [key]: { ...draft, xmlUnit },
                }))
              }
              options={units.map((unit) => ({ value: unit, label: unit }))}
            />
          </div>
          <div>
            <label className="text-fg-muted mb-1 block text-xs">
              Como converter para {targetUnit}
            </label>
            <ThemedSelect
              id={`conversion-mode-${key}`}
              value={draft.mode}
              onValueChange={(mode) =>
                setConversionDrafts((current) => ({
                  ...current,
                  [key]: {
                    ...draft,
                    mode: mode as ConversionDraft["mode"],
                  },
                }))
              }
              options={[
                {
                  value: "fixed_factor",
                  label: `Cada embalagem equivale a uma quantidade fixa de ${targetUnit}`,
                },
                ...(targetKind === "purchase" && !orderItem.sameUnit
                  ? [
                      {
                        value: "manual_quantity",
                        label: `Peso variável: confirmar quantidade em ${targetUnit}`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          {draft.mode === "fixed_factor" ? (
            <div>
              <label className="text-fg-muted mb-1 block text-xs">
                1 {draft.xmlUnit} equivale a
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="border-input bg-background text-fg h-9 min-w-0 rounded-lg border px-3 text-sm"
                  inputMode="decimal"
                  value={draft.factor}
                  onChange={(event) =>
                    setConversionDrafts((current) => ({
                      ...current,
                      [key]: { ...draft, factor: event.target.value },
                    }))
                  }
                  placeholder="Ex.: 12"
                />
                <span className="text-fg-muted text-xs">{targetUnit}</span>
              </div>
            </div>
          ) : (
            <p className="text-fg-muted text-xs">
              O saldo pedido será sugerido e exigirá confirmação.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={
              savingConversion === key ||
              !draft.xmlUnit ||
              (draft.mode === "fixed_factor" && !draft.factor)
            }
            onClick={() => void saveConversion(orderItem, imported, targetKind)}
          >
            {savingConversion === key ? "Salvando…" : "Salvar e aplicar"}
          </Button>
        </div>
      </div>
    );
  }

  function sourcedItemKey(xmlItem: SourcedNfeItem) {
    return `${xmlItem.receiptAccessKey}:${xmlItem.lineNumber}`;
  }

  async function associateItem(xmlItem: SourcedNfeItem) {
    if (!value) return;
    const sourceKey = sourcedItemKey(xmlItem);
    const orderItemId = associationSelections[sourceKey];
    const orderItem = items.find((item) => item.id === orderItemId);
    if (!orderItem) {
      setError("Escolha o produto correspondente no pedido.");
      return;
    }
    const previous = value.items[orderItem.id];
    if (
      previous &&
      previous.receiptAccessKey !== xmlItem.receiptAccessKey
    ) {
      setError(
        `"${orderItem.productName}" já está associado a outra NF-e nesta chegada. Confirme as notas em recebimentos parciais separados para preservar a origem fiscal.`,
      );
      return;
    }

    setAssociatingLine(sourceKey);
    setError(null);
    setMessage(null);
    const associationData = new FormData();
    associationData.set("receiptId", receiptId);
    associationData.set("orderRevisionItemId", orderItem.id);
    associationData.set("supplierName", xmlItem.description);
    if (xmlItem.supplierCode) {
      associationData.set("supplierCode", xmlItem.supplierCode);
    }
    const barcode = xmlItem.barcode ?? xmlItem.tributaryBarcode;
    if (barcode) associationData.set("barcode", barcode);
    const result = await learnSupplierProductAlias(associationData);
    if (result.error) {
      setError(result.error);
      setAssociatingLine(null);
      return;
    }

    const xmlItems = [...(previous?.xmlItems ?? []), xmlItem];
    onChange({
      ...value,
      items: {
        ...value.items,
        [orderItem.id]: {
          ...importedItemValues(xmlItems, itemWithCurrentRules(orderItem)),
          xmlItems,
          receiptAccessKey: xmlItem.receiptAccessKey,
          match: {
            orderItemId: orderItem.id,
            method: "supplier-name",
            confidence: 1,
          },
        },
      },
      unmatched: value.unmatched.filter(
        (item) => sourcedItemKey(item) !== sourceKey,
      ),
    });
    setMessage(result.message ?? "Associação salva.");
    setAssociatingLine(null);
  }

  async function linkIssuer(
    document: ImportedNfeDocument,
    adoptAsPrimary: boolean,
  ) {
    const accessKey = document.nfe.accessKey;
    if (!value || !accessKey) return;
    setLinkingAccessKey(accessKey);
    setError(null);
    setMessage(null);
    const documentData = new FormData();
    documentData.set("receiptId", receiptId);
    documentData.set("accessKey", accessKey);
    if (adoptAsPrimary) documentData.set("adoptAsPrimary", "on");
    const result = await linkReceiptIssuerFromNfe(documentData);
    if (result.error) {
      setError(result.error);
    } else {
      onChange({
        ...value,
        documents: value.documents.map((candidate) =>
          candidate.nfe.accessKey === accessKey
            ? { ...candidate, issuerLinked: true }
            : candidate,
        ),
        warnings: value.warnings.filter(
          (warning) => !warning.startsWith(`[${accessKey}]`),
        ),
      });
      if (adoptAsPrimary) setHasPrimarySupplierDocument(true);
      setMessage(result.message ?? "Empresa emitente vinculada.");
    }
    setLinkingAccessKey(null);
  }

  async function removeXml(accessKey: string) {
    if (!value) return;
    setRemovingAccessKey(accessKey);
    setError(null);
    const removalData = new FormData();
    removalData.set("receiptId", receiptId);
    removalData.set("accessKey", accessKey);
    const removal = await deleteReceiptNfe(removalData);
    if (removal.error) {
      setError(removal.error);
    } else {
      onChange(payloadWithoutDocument(value, accessKey));
    }
    setRemovingAccessKey(null);
  }

  async function importXml(
    file: File,
    current: NfeImportPayload | null,
  ): Promise<NfeImportPayload> {
    if (file.size > XML_MAX_SIZE) {
      throw new Error("O XML deve ter no máximo 4 MB.");
    }
    if (!file.name.toLowerCase().endsWith(".xml")) {
      throw new Error("Selecione o arquivo XML da NF-e.");
    }

    const nfe = parseNfeXml(await file.text());
    const expectedRecipient = digits(companyDocument);
    if (
      expectedRecipient &&
      nfe.recipient.document &&
      expectedRecipient !== nfe.recipient.document
    ) {
      throw new Error(
        "A NF-e é destinada ao documento " +
          formatDocument(nfe.recipient.document) +
          ", diferente da empresa atual (" +
          formatDocument(expectedRecipient) +
          ").",
      );
    }
    if (
      current?.documents.some(
        (document) => document.nfe.accessKey === nfe.accessKey,
      )
    ) {
      throw new Error(`A NF-e ${nfe.number} já foi adicionada.`);
    }

    const grouped = new Map<
      string,
      { xmlItems: NfeItem[]; match: NfeItemMatch }
    >();
    const unmatched: SourcedNfeItem[] = [];
    for (const xmlItem of nfe.items) {
      const match = matchNfeItem(xmlItem, items);
      if (!match) {
        unmatched.push({
          ...xmlItem,
          receiptAccessKey: nfe.accessKey!,
        });
        continue;
      }
      const currentGroup = grouped.get(match.orderItemId);
      if (currentGroup) {
        currentGroup.xmlItems.push(xmlItem);
        if (match.confidence > currentGroup.match.confidence) {
          currentGroup.match = match;
        }
      } else {
        grouped.set(match.orderItemId, { xmlItems: [xmlItem], match });
      }
    }

    const importedItems: Record<string, ImportedNfeItem> = {};
    for (const item of items) {
      const group = grouped.get(item.id);
      if (!group) continue;
      if (
        current?.items[item.id] &&
        current.items[item.id].receiptAccessKey !== nfe.accessKey
      ) {
        throw new Error(
          `O produto "${item.productName}" aparece em mais de uma NF-e nesta chegada. Confira uma nota por vez para manter a origem fiscal exata.`,
        );
      }
      importedItems[item.id] = {
        ...importedItemValues(group.xmlItems, itemWithCurrentRules(item)),
        xmlItems: group.xmlItems,
        match: group.match,
        receiptAccessKey: nfe.accessKey!,
      };
    }
    const uploadData = new FormData();
    uploadData.set("receiptId", receiptId);
    uploadData.set("file", file);
    const upload = await uploadReceiptNfe(uploadData);
    if (upload.error) throw new Error(upload.error);

    const warnings: string[] = [];
    if (!expectedRecipient) {
      warnings.push(
        `[${nfe.accessKey}] Cadastre o CNPJ da empresa para validar automaticamente o destinatário.`,
      );
    } else if (!nfe.recipient.document) {
      warnings.push(
        `[${nfe.accessKey}] O XML não informou o documento do destinatário.`,
      );
    }
    if (!nfe.issuer.document) {
      warnings.push(
        `[${nfe.accessKey}] O XML não informou o CNPJ do emitente.`,
      );
    } else if (!upload.issuerLinked) {
      warnings.push(
        `[${nfe.accessKey}] Confirme uma vez que ${nfe.issuer.name ?? "a empresa emitente"} (${formatDocument(nfe.issuer.document)}) pertence a este fornecedor comercial.`,
      );
    }

    const document: ImportedNfeDocument = {
      fileName: file.name,
      nfe,
      issuerLinked: Boolean(upload.issuerLinked),
    };
    const documents = [...(current?.documents ?? []), document];
    return {
      fileName: documents.map((entry) => entry.fileName).join(", "),
      nfe: aggregateNfeDocuments(documents),
      documents,
      items: { ...(current?.items ?? {}), ...importedItems },
      unmatched: [...(current?.unmatched ?? []), ...unmatched],
      warnings: [...(current?.warnings ?? []), ...warnings],
    };
  }

  async function importFiles(files: Iterable<File> | null) {
    if (!files) return;
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    setReading(true);
    setError(null);
    setMessage(null);
    let next = value;
    try {
      for (const file of selectedFiles) {
        next = await importXml(file, next);
        onChange(next);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível ler o XML.",
      );
    } finally {
      setReading(false);
    }
  }

  async function loadExistingDocuments() {
    const available = existingDocuments.filter(
      (document) => document.downloadUrl,
    );
    if (!available.length) return;
    setReading(true);
    setError(null);
    try {
      const files = await Promise.all(
        available.map(async (document) => {
          const response = await fetch(document.downloadUrl!);
          if (!response.ok) {
            throw new Error("Não foi possível reler os XMLs anexados.");
          }
          return new File([await response.blob()], document.fileName, {
            type: "application/xml",
          });
        }),
      );
      setReading(false);
      await importFiles(files);
    } catch (cause) {
      setReading(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível reler os XMLs anexados.",
      );
    }
  }

  const matchedCount = value ? Object.keys(value.items).length : 0;
  return (
    <section className="border-border bg-surface rounded-xl border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCode2 className="text-primary size-5" aria-hidden />
            <h2 className="text-fg text-sm font-semibold">
              Importar XML da NF-e
            </h2>
          </div>
          <p className="text-fg-muted mt-1 text-sm">
            Adicione uma ou várias notas desta chegada. O CNPJ de cada emitente
            será reconhecido pelo próprio XML.
          </p>
        </div>
        <label
          htmlFor={inputId}
          className="border-input bg-background hover:bg-muted text-fg inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium"
        >
          <Upload className="size-4" aria-hidden />
          {reading
            ? "Lendo XML…"
            : value
              ? "Adicionar mais XMLs"
              : "Selecionar XMLs"}
          <input
            id={inputId}
            type="file"
            multiple
            accept=".xml,application/xml,text/xml"
            className="sr-only"
            disabled={reading}
            onChange={(event) => {
              void importFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <div className="mt-3">
        <ErrorLine error={error} />
        <SuccessLine message={message} />
      </div>
      {!value && existingDocuments.length ? (
        <div className="bg-surface-sunken text-fg-muted mt-3 rounded-lg px-3 py-2 text-sm">
          <p>
            Este recebimento já possui XML anexado. Para preencher novamente os
            campos, selecione o mesmo arquivo.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reading}
              onClick={() => void loadExistingDocuments()}
            >
              {reading ? "Carregando…" : "Retomar conciliação"}
            </Button>
            {existingDocuments.map((document) =>
              document.downloadUrl ? (
                <a
                  key={document.id}
                  href={document.downloadUrl}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  Baixar {document.fileName}
                </a>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
      {value ? (
        <div className="mt-4 space-y-3">
          <div
            role="status"
            className="bg-success-soft text-success flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>
                {value.documents.length}{" "}
                {value.documents.length === 1
                  ? "NF-e carregada"
                  : "NF-e carregadas"}
              </strong>
              . {matchedCount}{" "}
              {matchedCount === 1 ? "produto associado" : "produtos associados"}
              .
            </span>
          </div>
          <div className="space-y-2">
            {value.documents.map((document) => {
              const accessKey = document.nfe.accessKey!;
              const canLink =
                digits(document.nfe.issuer.document).length === 14;
              const adoptAsPrimary =
                !hasPrimarySupplierDocument && canUpdateSupplier;
              return (
                <div
                  key={accessKey}
                  className="border-border bg-surface-sunken flex flex-col gap-3 rounded-lg border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-fg font-medium">
                        NF-e {document.nfe.number} ·{" "}
                        {document.nfe.issuer.name ??
                          "Emitente não identificado"}
                      </p>
                      <Badge
                        variant={document.issuerLinked ? "secondary" : "outline"}
                      >
                        {document.issuerLinked
                          ? "Emitente reconhecido"
                          : "Confirmar emitente"}
                      </Badge>
                    </div>
                    <p className="text-fg-muted mt-1 text-xs">
                      {formatDocument(document.nfe.issuer.document)} ·{" "}
                      {MONEY.format(document.nfe.total)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!document.issuerLinked ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canLink || linkingAccessKey === accessKey}
                        onClick={() => void linkIssuer(document, adoptAsPrimary)}
                      >
                        {linkingAccessKey === accessKey
                          ? "Vinculando…"
                          : adoptAsPrimary
                            ? "Vincular e usar como principal"
                            : "Vincular ao fornecedor"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={removingAccessKey === accessKey}
                      onClick={() => void removeXml(accessKey)}
                    >
                      <X className="size-4" aria-hidden />
                      {removingAccessKey === accessKey
                        ? "Removendo…"
                        : "Remover"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {value.warnings.length || value.unmatched.length ? (
            <div className="bg-warning-soft text-warning rounded-lg px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  {value.warnings.map((warning) => (
                    <p key={warning}>
                      {warning.replace(/^\[\d{44}\]\s*/, "")}
                    </p>
                  ))}
                  {value.unmatched.length ? (
                    <p>
                      {value.unmatched.length}{" "}
                      {value.unmatched.length === 1
                        ? "item da nota não foi associado"
                        : "itens da nota não foram associados"}
                      :{" "}
                      {value.unmatched
                        .map((item) => item.description)
                        .join(", ")}
                      .
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {Object.entries(value.items).some(([itemId, imported]) => {
            const orderItem = items.find((item) => item.id === itemId);
            return Boolean(
              orderItem &&
              (imported.logisticQuantity === null ||
                (!orderItem.sameUnit && imported.pricingQuantity === null)),
            );
          }) ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Scale
                  className="text-warning mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <div>
                  <p className="text-fg text-sm font-medium">
                    Unidades que precisam de conversão
                  </p>
                  <p className="text-fg-muted text-xs">
                    Nenhuma quantidade será presumida sem uma regra clara.
                  </p>
                </div>
              </div>
              {Object.entries(value.items).flatMap(([itemId, imported]) => {
                const orderItem = items.find((item) => item.id === itemId);
                if (!orderItem) return [];
                const editors: React.ReactNode[] = [];
                if (imported.logisticQuantity === null) {
                  editors.push(
                    conversionEditor(orderItem, imported, "purchase"),
                  );
                }
                if (!orderItem.sameUnit && imported.pricingQuantity === null) {
                  editors.push(
                    conversionEditor(orderItem, imported, "pricing"),
                  );
                }
                return editors;
              })}
            </div>
          ) : null}
          {value.unmatched.length ? (
            <div className="border-warning/40 bg-warning/5 rounded-lg border p-3">
              <div className="mb-3 flex items-start gap-2">
                <Link2
                  className="text-warning mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <div>
                  <p className="text-fg text-sm font-medium">
                    Ensinar correspondência dos produtos
                  </p>
                  <p className="text-fg-muted text-xs">
                    Associe uma vez. Nas próximas notas deste fornecedor, o
                    código e o nome serão reconhecidos automaticamente.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {value.unmatched.map((xmlItem) => (
                  <div
                    key={sourcedItemKey(xmlItem)}
                    className="border-border bg-surface grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)_auto] sm:items-end"
                  >
                    <div className="min-w-0">
                      <p className="text-fg truncate text-sm font-medium">
                        {xmlItem.description}
                      </p>
                      <p className="text-fg-muted text-xs">
                        Código {xmlItem.supplierCode ?? "não informado"} ·{" "}
                        {QTY.format(xmlItem.commercialQuantity)}{" "}
                        {xmlItem.commercialUnit ?? ""}
                      </p>
                    </div>
                    <ThemedSelect
                      id={`nfe-association-${sourcedItemKey(xmlItem)}`}
                      value={
                        associationSelections[sourcedItemKey(xmlItem)] ?? ""
                      }
                      onValueChange={(selected) =>
                        setAssociationSelections((current) => ({
                          ...current,
                          [sourcedItemKey(xmlItem)]: selected,
                        }))
                      }
                      placeholder="Escolher produto do pedido"
                      options={items.map((item) => ({
                        value: item.id,
                        label: item.productName,
                      }))}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !associationSelections[sourcedItemKey(xmlItem)] ||
                        associatingLine === sourcedItemKey(xmlItem)
                      }
                      onClick={() => void associateItem(xmlItem)}
                    >
                      {associatingLine === sourcedItemKey(xmlItem)
                        ? "Associando…"
                        : "Associar"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-fg-subtle text-xs">
            Cada XML permanece separado para preservar CNPJ, impostos e valor
            fiscal de cada empresa emitente.
          </p>
        </div>
      ) : null}
    </section>
  );
}
