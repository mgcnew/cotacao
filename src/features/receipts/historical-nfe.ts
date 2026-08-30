import "server-only";

import type {
  NfeFiscalTotals,
  NfeItem,
  ParsedNfe,
} from "@/features/receipts/nfe";

function decodeXml(value: string) {
  return value.replace(
    /&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi,
    (entity, code: string) => {
      const named: Record<string, string> = {
        lt: "<",
        gt: ">",
        amp: "&",
        quot: '"',
        apos: "'",
      };
      const lowered = code.toLowerCase();
      if (named[lowered]) return named[lowered];
      const point = lowered.startsWith("#x")
        ? Number.parseInt(lowered.slice(2), 16)
        : Number.parseInt(lowered.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    },
  );
}

function sections(xml: string, tag: string) {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,
    "gi",
  );
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function section(xml: string, tag: string) {
  return sections(xml, tag)[0] ?? null;
}

function text(xml: string | null, tag: string) {
  if (!xml) return null;
  const content = section(xml, tag)
    ?.replace(/<[^>]+>/g, "")
    .trim();
  return content ? decodeXml(content) : null;
}

function number(xml: string | null, tag: string) {
  const parsed = Number(text(xml, tag));
  return Number.isFinite(parsed) ? parsed : 0;
}

function documentNumber(xml: string | null) {
  return (text(xml, "CNPJ") ?? text(xml, "CPF"))?.replace(/\D/g, "") ?? null;
}

function barcode(value: string | null) {
  if (!value || /^(sem gtin|no gtin)$/i.test(value)) return null;
  return value.replace(/\s/g, "").toUpperCase();
}

function fiscalTotals(totals: string): NfeFiscalTotals {
  const products = number(totals, "vProd");
  const freight = number(totals, "vFrete");
  const insurance = number(totals, "vSeg");
  const discount = number(totals, "vDesc");
  const other = number(totals, "vOutro");
  const importTax = number(totals, "vII");
  const ipi = number(totals, "vIPI");
  const returnedIpi = number(totals, "vIPIDevol");
  const icmsSt = number(totals, "vST");
  const fcpSt = number(totals, "vFCPST");
  const monophaseRetainedIcms = number(totals, "vICMSMonoReten");
  const services = number(totals, "vServ");
  const desoneratedIcms = number(totals, "vICMSDeson");
  const estimatedTaxes = number(totals, "vTotTrib");
  const invoice = number(totals, "vNF");
  const composedTotal =
    products -
    discount -
    desoneratedIcms +
    icmsSt +
    fcpSt +
    monophaseRetainedIcms +
    freight +
    insurance +
    other +
    importTax +
    ipi +
    returnedIpi +
    services;
  return {
    products,
    freight,
    insurance,
    discount,
    other,
    importTax,
    ipi,
    returnedIpi,
    icmsSt,
    fcpSt,
    monophaseRetainedIcms,
    services,
    desoneratedIcms,
    estimatedTaxes,
    invoice,
    composedTotal,
    residual: invoice - composedTotal,
  };
}

export type HistoricalNfeItem = NfeItem & {
  itemDiscount: number;
  itemFreight: number;
  itemInsurance: number;
  itemOther: number;
  netProductTotal: number;
};

export type ParsedHistoricalNfe = Omit<ParsedNfe, "items"> & {
  items: HistoricalNfeItem[];
};

export function parseHistoricalNfeXml(xml: string): ParsedHistoricalNfe {
  const info = section(xml, "infNFe");
  const protocol = section(xml, "infProt");
  if (
    !info ||
    !protocol ||
    !["100", "150"].includes(text(protocol, "cStat") ?? "")
  ) {
    throw new Error("O XML não possui autorização de uso da NF-e.");
  }
  if (sections(xml, "tpEvento").some((event) => event.trim() === "110111")) {
    throw new Error("A NF-e possui evento de cancelamento.");
  }

  const identification = section(info, "ide");
  const issuer = section(info, "emit");
  const recipient = section(info, "dest");
  const totals = section(info, "ICMSTot");
  const itemSections = [
    ...info.matchAll(
      /<(?:[\w.-]+:)?det\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?det>/gi,
    ),
  ].map((match) => ({ attributes: match[1], xml: match[2] }));
  const invoiceNumber = text(identification, "nNF");
  const issuedAt =
    text(identification, "dhEmi") ?? text(identification, "dEmi");
  if (
    !identification ||
    !issuer ||
    !recipient ||
    !totals ||
    !invoiceNumber ||
    !issuedAt ||
    !itemSections.length
  ) {
    throw new Error("O XML da NF-e está incompleto ou não possui produtos.");
  }

  const rawId = /\bId\s*=\s*["']NFe(\d{44})["']/i.exec(info)?.[1];
  const accessKey = rawId ?? text(protocol, "chNFe");
  if (!accessKey || !/^\d{44}$/.test(accessKey)) {
    throw new Error("A chave de acesso da NF-e é inválida.");
  }

  const items = itemSections.map((itemRecord, index) => {
    const product = section(itemRecord.xml, "prod");
    if (!product)
      throw new Error(`O item ${index + 1} não possui dados do produto.`);
    const productTotal = number(product, "vProd");
    const itemDiscount = number(product, "vDesc");
    return {
      lineNumber:
        /\bnItem\s*=\s*["']([^"']+)["']/i.exec(itemRecord.attributes)?.[1] ??
        String(index + 1),
      supplierCode: text(product, "cProd"),
      barcode: barcode(text(product, "cEAN")),
      tributaryBarcode: barcode(text(product, "cEANTrib")),
      description: text(product, "xProd") ?? `Item ${index + 1}`,
      commercialUnit: text(product, "uCom"),
      commercialQuantity: number(product, "qCom"),
      commercialUnitPrice: number(product, "vUnCom"),
      tributaryUnit: text(product, "uTrib"),
      tributaryQuantity: number(product, "qTrib"),
      tributaryUnitPrice: number(product, "vUnTrib"),
      total: productTotal,
      discount: itemDiscount,
      itemDiscount,
      itemFreight: number(product, "vFrete"),
      itemInsurance: number(product, "vSeg"),
      itemOther: number(product, "vOutro"),
      netProductTotal: Math.max(productTotal - itemDiscount, 0),
    };
  });
  const parsedTotals = fiscalTotals(totals);

  return {
    accessKey,
    number: invoiceNumber,
    series: text(identification, "serie"),
    issuedAt,
    issuer: { document: documentNumber(issuer), name: text(issuer, "xNome") },
    recipient: {
      document: documentNumber(recipient),
      name: text(recipient, "xNome"),
    },
    total: parsedTotals.invoice,
    fiscalTotals: parsedTotals,
    items,
  };
}
