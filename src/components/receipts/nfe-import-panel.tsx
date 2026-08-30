"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Link2,
  Upload,
  X,
} from "lucide-react";
import * as React from "react";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  adoptSupplierDocumentFromNfe,
  deleteReceiptNfe,
  learnSupplierProductAlias,
  uploadReceiptNfe,
} from "@/features/receipts/actions";
import {
  digits,
  matchNfeItem,
  nfePriceForUnit,
  nfeQuantityForUnit,
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
};

export type ImportedNfeItem = {
  logisticQuantity: number | null;
  pricingQuantity: number | null;
  practicedPrice: number | null;
  xmlItems: NfeItem[];
  match: NfeItemMatch;
  warnings: string[];
};

export type NfeImportPayload = {
  fileName: string;
  nfe: ParsedNfe;
  items: Record<string, ImportedNfeItem>;
  unmatched: NfeItem[];
  warnings: string[];
};

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

function importedItemValues(
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

  if (orderItem.sameUnit && logisticQuantity === null) {
    logisticQuantity = xmlItems.reduce(
      (sum, xmlItem) => sum + xmlItem.commercialQuantity,
      0,
    );
    pricingQuantity = logisticQuantity;
    warnings.push(
      "A unidade da nota não correspondeu a " +
        orderItem.purchaseUnit +
        "; confira a quantidade sugerida.",
    );
  } else if (orderItem.sameUnit) {
    pricingQuantity = logisticQuantity;
  } else {
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

  const itemTotal = xmlItems.reduce((sum, xmlItem) => sum + xmlItem.total, 0);
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

  return { logisticQuantity, pricingQuantity, practicedPrice, warnings };
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
  const [removing, setRemoving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [associationSelections, setAssociationSelections] = React.useState<
    Record<string, string>
  >({});
  const [associatingLine, setAssociatingLine] = React.useState<string | null>(
    null,
  );
  const [updatingSupplier, setUpdatingSupplier] = React.useState(false);
  const [adoptedSupplierDocument, setAdoptedSupplierDocument] = React.useState<
    string | null
  >(null);
  const inputId = React.useId();

  async function associateItem(xmlItem: NfeItem) {
    if (!value) return;
    const orderItemId = associationSelections[xmlItem.lineNumber];
    const orderItem = items.find((item) => item.id === orderItemId);
    if (!orderItem) {
      setError("Escolha o produto correspondente no pedido.");
      return;
    }

    setAssociatingLine(xmlItem.lineNumber);
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

    const previous = value.items[orderItem.id];
    const xmlItems = [...(previous?.xmlItems ?? []), xmlItem];
    onChange({
      ...value,
      items: {
        ...value.items,
        [orderItem.id]: {
          ...importedItemValues(xmlItems, orderItem),
          xmlItems,
          match: {
            orderItemId: orderItem.id,
            method: "supplier-name",
            confidence: 1,
          },
        },
      },
      unmatched: value.unmatched.filter(
        (item) => item.lineNumber !== xmlItem.lineNumber,
      ),
    });
    setMessage(result.message ?? "Associação salva.");
    setAssociatingLine(null);
  }

  async function adoptSupplierDocument() {
    if (!value?.nfe.accessKey) return;
    setUpdatingSupplier(true);
    setError(null);
    setMessage(null);
    const documentData = new FormData();
    documentData.set("receiptId", receiptId);
    documentData.set("accessKey", value.nfe.accessKey);
    const result = await adoptSupplierDocumentFromNfe(documentData);
    if (result.error) {
      setError(result.error);
    } else {
      setAdoptedSupplierDocument(result.documentNumber ?? null);
      setMessage(result.message ?? "Fornecedor atualizado.");
      if (value) {
        onChange({
          ...value,
          warnings: value.warnings.filter(
            (warning) => !warning.startsWith("Cadastre o CNPJ do fornecedor"),
          ),
        });
      }
    }
    setUpdatingSupplier(false);
  }

  async function removeXml() {
    if (!value?.nfe.accessKey) return;
    setRemoving(true);
    setError(null);
    const removalData = new FormData();
    removalData.set("receiptId", receiptId);
    removalData.set("accessKey", value.nfe.accessKey);
    const removal = await deleteReceiptNfe(removalData);
    if (removal.error) {
      setError(removal.error);
    } else {
      onChange(null);
    }
    setRemoving(false);
  }

  async function importXml(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError(null);
    setMessage(null);
    try {
      if (file.size > XML_MAX_SIZE) {
        throw new Error("O XML deve ter no máximo 4 MB.");
      }
      if (!file.name.toLowerCase().endsWith(".xml")) {
        throw new Error("Selecione o arquivo XML da NF-e.");
      }

      const nfe = parseNfeXml(await file.text());
      const expectedRecipient = digits(companyDocument);
      const expectedIssuer = digits(supplierDocument);
      const issuerBranchDiffers = Boolean(
        expectedIssuer &&
          nfe.issuer.document &&
          expectedIssuer !== nfe.issuer.document &&
          expectedIssuer.slice(0, 8) === nfe.issuer.document.slice(0, 8),
      );
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
        expectedIssuer &&
        nfe.issuer.document &&
        expectedIssuer.slice(0, 8) !== nfe.issuer.document.slice(0, 8)
      ) {
        throw new Error(
          "O emitente da NF-e (" +
            formatDocument(nfe.issuer.document) +
            ") é diferente do fornecedor deste pedido (" +
            formatDocument(expectedIssuer) +
            ").",
        );
      }

      const grouped = new Map<
        string,
        { xmlItems: NfeItem[]; match: NfeItemMatch }
      >();
      const unmatched: NfeItem[] = [];
      for (const xmlItem of nfe.items) {
        const match = matchNfeItem(xmlItem, items);
        if (!match) {
          unmatched.push(xmlItem);
          continue;
        }
        const current = grouped.get(match.orderItemId);
        if (current) {
          current.xmlItems.push(xmlItem);
          if (match.confidence > current.match.confidence)
            current.match = match;
        } else {
          grouped.set(match.orderItemId, { xmlItems: [xmlItem], match });
        }
      }

      const importedItems: Record<string, ImportedNfeItem> = {};
      for (const item of items) {
        const group = grouped.get(item.id);
        if (!group) continue;
        importedItems[item.id] = {
          ...importedItemValues(group.xmlItems, item),
          xmlItems: group.xmlItems,
          match: group.match,
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
          "Cadastre o CNPJ da empresa para validar automaticamente o destinatário.",
        );
      } else if (!nfe.recipient.document) {
        warnings.push("O XML não informou o documento do destinatário.");
      }
      if (!expectedIssuer) {
        warnings.push(
          "Cadastre o CNPJ do fornecedor para validar automaticamente o emitente.",
        );
      } else if (!nfe.issuer.document) {
        warnings.push("O XML não informou o documento do emitente.");
      } else if (issuerBranchDiffers) {
        warnings.push(
          "A nota foi emitida por outro estabelecimento da mesma raiz de CNPJ do fornecedor.",
        );
      }

      onChange({
        fileName: file.name,
        nfe,
        items: importedItems,
        unmatched,
        warnings,
      });
    } catch (cause) {
      onChange(null);
      setError(
        cause instanceof Error ? cause.message : "Não foi possível ler o XML.",
      );
    } finally {
      setReading(false);
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
            Preenche a nota e associa os produtos. Revise os campos antes de
            finalizar a conferência.
          </p>
        </div>
        {value ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={removing}
            onClick={() => void removeXml()}
          >
            <X className="size-4" aria-hidden />
            {removing ? "Removendo…" : "Remover XML"}
          </Button>
        ) : (
          <label
            htmlFor={inputId}
            className="border-input bg-background hover:bg-muted text-fg inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium"
          >
            <Upload className="size-4" aria-hidden />
            {reading ? "Lendo XML…" : "Selecionar XML"}
            <input
              id={inputId}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="sr-only"
              disabled={reading}
              onChange={(event) => void importXml(event.target.files?.[0])}
            />
          </label>
        )}
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
              <strong>NF-e {value.nfe.number}</strong> carregada de{" "}
              {value.nfe.issuer.name ?? "fornecedor não identificado"}.{" "}
              {matchedCount}{" "}
              {matchedCount === 1 ? "produto associado" : "produtos associados"}
              .
            </span>
          </div>
          {!supplierDocument &&
          !adoptedSupplierDocument &&
          digits(value.nfe.issuer.document).length === 14 ? (
            <div className="border-border bg-surface-sunken flex flex-col gap-3 rounded-lg border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-fg font-medium">
                  Completar cadastro do fornecedor
                </p>
                <p className="text-fg-muted text-xs">
                  CNPJ identificado no XML:{" "}
                  {formatDocument(value.nfe.issuer.document)}
                </p>
              </div>
              {canUpdateSupplier ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={updatingSupplier}
                  onClick={() => void adoptSupplierDocument()}
                >
                  {updatingSupplier ? "Atualizando…" : "Usar CNPJ da nota"}
                </Button>
              ) : (
                <span className="text-fg-subtle text-xs">
                  É necessária permissão para editar fornecedores.
                </span>
              )}
            </div>
          ) : null}
          {adoptedSupplierDocument ? (
            <p className="bg-success-soft text-success rounded-lg px-3 py-2 text-sm">
              CNPJ {formatDocument(adoptedSupplierDocument)} salvo no
              fornecedor.
            </p>
          ) : null}
          {value.warnings.length || value.unmatched.length ? (
            <div className="bg-warning-soft text-warning rounded-lg px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  {value.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
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
                    key={xmlItem.lineNumber}
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
                      id={`nfe-association-${xmlItem.lineNumber}`}
                      value={associationSelections[xmlItem.lineNumber] ?? ""}
                      onValueChange={(selected) =>
                        setAssociationSelections((current) => ({
                          ...current,
                          [xmlItem.lineNumber]: selected,
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
                        !associationSelections[xmlItem.lineNumber] ||
                        associatingLine === xmlItem.lineNumber
                      }
                      onClick={() => void associateItem(xmlItem)}
                    >
                      {associatingLine === xmlItem.lineNumber
                        ? "Associando…"
                        : "Associar"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-fg-subtle break-all text-xs">
            Arquivo: {value.fileName} · chave{" "}
            {value.nfe.accessKey ?? "não informada"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
