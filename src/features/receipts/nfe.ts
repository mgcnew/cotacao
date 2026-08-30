export type NfeParty = {
  document: string | null;
  name: string | null;
};

export type NfeItem = {
  lineNumber: string;
  supplierCode: string | null;
  barcode: string | null;
  tributaryBarcode: string | null;
  description: string;
  commercialUnit: string | null;
  commercialQuantity: number;
  commercialUnitPrice: number;
  tributaryUnit: string | null;
  tributaryQuantity: number;
  tributaryUnitPrice: number;
  total: number;
  discount: number;
};

export type ParsedNfe = {
  accessKey: string | null;
  number: string;
  series: string | null;
  issuedAt: string | null;
  issuer: NfeParty;
  recipient: NfeParty;
  total: number;
  fiscalTotals: NfeFiscalTotals;
  items: NfeItem[];
};

export type NfeFiscalTotals = {
  products: number;
  freight: number;
  insurance: number;
  discount: number;
  other: number;
  importTax: number;
  ipi: number;
  returnedIpi: number;
  icmsSt: number;
  fcpSt: number;
  monophaseRetainedIcms: number;
  services: number;
  desoneratedIcms: number;
  estimatedTaxes: number;
  invoice: number;
  composedTotal: number;
  residual: number;
};

export type NfeOrderItem = {
  id: string;
  productName: string;
  barcodes: string[];
  aliases: {
    supplierCode: string | null;
    supplierName: string;
    barcode: string | null;
  }[];
};

export type NfeItemMatch = {
  orderItemId: string;
  method:
    | "supplier-code"
    | "supplier-name"
    | "barcode"
    | "exact-name"
    | "similar-name";
  confidence: number;
};

function descendants(scope: ParentNode, localName: string): Element[] {
  return Array.from(scope.querySelectorAll("*")).filter(
    (node) => node.localName === localName,
  );
}

function first(scope: ParentNode, localName: string): Element | null {
  return descendants(scope, localName)[0] ?? null;
}

function value(scope: ParentNode, localName: string): string | null {
  const content = first(scope, localName)?.textContent?.trim();
  return content || null;
}

function numberValue(scope: ParentNode, localName: string): number {
  const parsed = Number(value(scope, localName));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function digits(valueToNormalize: string | null | undefined) {
  return String(valueToNormalize ?? "").replace(/\D/g, "");
}

export function normalizedBarcode(valueToNormalize: string | null | undefined) {
  const normalized = String(valueToNormalize ?? "").trim();
  if (!normalized || /^(sem gtin|no gtin)$/i.test(normalized)) return null;
  return normalized.replace(/\s/g, "").toUpperCase();
}

export function normalizeProductName(valueToNormalize: string) {
  return valueToNormalize
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeProductName(left);
  const normalizedRight = normalizeProductName(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
  const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  );
  const union = new Set([...leftTokens, ...rightTokens]);
  const tokenScore = intersection.length / Math.max(union.size, 1);
  const containmentScore =
    intersection.length /
    Math.max(Math.min(leftTokens.size, rightTokens.size), 1);
  const containsScore =
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
      ? Math.min(normalizedLeft.length, normalizedRight.length) /
        Math.max(normalizedLeft.length, normalizedRight.length)
      : 0;
  return Math.max(tokenScore, containmentScore * 0.85, containsScore);
}

export function parseNfeXml(xml: string): ParsedNfe {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("O arquivo não contém um XML válido.");
  }

  const info = first(document, "infNFe");
  if (!info) {
    throw new Error("O arquivo não é uma NF-e autorizada com dados da nota.");
  }

  const protocol = first(document, "infProt");
  const authorizationStatus = protocol ? value(protocol, "cStat") : null;
  if (!protocol || !["100", "150"].includes(authorizationStatus ?? "")) {
    throw new Error(
      "O XML não possui o protocolo de autorização de uso da NF-e.",
    );
  }
  if (
    descendants(document, "tpEvento").some(
      (eventType) => eventType.textContent?.trim() === "110111",
    )
  ) {
    throw new Error(
      "A NF-e possui evento de cancelamento e não pode ser recebida.",
    );
  }

  const identification = first(info, "ide");
  const issuer = first(info, "emit");
  const recipient = first(info, "dest");
  const totals = first(info, "ICMSTot");
  const itemNodes = descendants(info, "det");
  const number = identification ? value(identification, "nNF") : null;
  if (!number || !issuer || !recipient || !totals || itemNodes.length === 0) {
    throw new Error("O XML da NF-e está incompleto ou não possui produtos.");
  }

  const items = itemNodes.map((itemNode, index) => {
    const product = first(itemNode, "prod");
    if (!product) {
      throw new Error(
        `O item ${index + 1} da NF-e não possui dados do produto.`,
      );
    }
    return {
      lineNumber: itemNode.getAttribute("nItem") ?? String(index + 1),
      supplierCode: value(product, "cProd"),
      barcode: normalizedBarcode(value(product, "cEAN")),
      tributaryBarcode: normalizedBarcode(value(product, "cEANTrib")),
      description: value(product, "xProd") ?? `Item ${index + 1}`,
      commercialUnit: value(product, "uCom"),
      commercialQuantity: numberValue(product, "qCom"),
      commercialUnitPrice: numberValue(product, "vUnCom"),
      tributaryUnit: value(product, "uTrib"),
      tributaryQuantity: numberValue(product, "qTrib"),
      tributaryUnitPrice: numberValue(product, "vUnTrib"),
      total: numberValue(product, "vProd"),
      discount: numberValue(product, "vDesc"),
    };
  });

  const products = numberValue(totals, "vProd");
  const freight = numberValue(totals, "vFrete");
  const insurance = numberValue(totals, "vSeg");
  const discount = numberValue(totals, "vDesc");
  const other = numberValue(totals, "vOutro");
  const importTax = numberValue(totals, "vII");
  const ipi = numberValue(totals, "vIPI");
  const returnedIpi = numberValue(totals, "vIPIDevol");
  const icmsSt = numberValue(totals, "vST");
  const fcpSt = numberValue(totals, "vFCPST");
  const monophaseRetainedIcms = numberValue(totals, "vICMSMonoReten");
  const services = numberValue(totals, "vServ");
  const desoneratedIcms = numberValue(totals, "vICMSDeson");
  const estimatedTaxes = numberValue(totals, "vTotTrib");
  const invoice = numberValue(totals, "vNF");
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

  const rawId = info.getAttribute("Id");
  const accessKey = rawId?.replace(/^NFe/i, "") || value(protocol, "chNFe");
  if (!accessKey || !/^\d{44}$/.test(accessKey)) {
    throw new Error(
      "A chave de acesso da NF-e é inválida ou não foi informada.",
    );
  }
  return {
    accessKey,
    number,
    series: identification ? value(identification, "serie") : null,
    issuedAt: identification
      ? (value(identification, "dhEmi") ?? value(identification, "dEmi"))
      : null,
    issuer: {
      document: digits(value(issuer, "CNPJ") ?? value(issuer, "CPF")) || null,
      name: value(issuer, "xNome"),
    },
    recipient: {
      document:
        digits(value(recipient, "CNPJ") ?? value(recipient, "CPF")) || null,
      name: value(recipient, "xNome"),
    },
    total: invoice,
    fiscalTotals: {
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
    },
    items,
  };
}

export function matchNfeItem(
  nfeItem: NfeItem,
  orderItems: NfeOrderItem[],
): NfeItemMatch | null {
  if (nfeItem.supplierCode) {
    const codeMatches = orderItems.filter((item) =>
      item.aliases.some((alias) => alias.supplierCode === nfeItem.supplierCode),
    );
    if (codeMatches.length === 1) {
      return {
        orderItemId: codeMatches[0].id,
        method: "supplier-code",
        confidence: 1,
      };
    }
  }

  const nfeBarcodes = new Set(
    [nfeItem.barcode, nfeItem.tributaryBarcode].filter(
      (barcode): barcode is string => Boolean(barcode),
    ),
  );
  if (nfeBarcodes.size) {
    const aliasBarcodeMatches = orderItems.filter((item) =>
      item.aliases.some((alias) =>
        nfeBarcodes.has(normalizedBarcode(alias.barcode) ?? ""),
      ),
    );
    if (aliasBarcodeMatches.length === 1) {
      return {
        orderItemId: aliasBarcodeMatches[0].id,
        method: "supplier-code",
        confidence: 1,
      };
    }
    const barcodeMatches = orderItems.filter((item) =>
      item.barcodes.some((barcode) =>
        nfeBarcodes.has(normalizedBarcode(barcode) ?? ""),
      ),
    );
    if (barcodeMatches.length === 1) {
      return {
        orderItemId: barcodeMatches[0].id,
        method: "barcode",
        confidence: 1,
      };
    }
  }

  const aliasNameMatches = orderItems.filter((item) =>
    item.aliases.some(
      (alias) =>
        normalizeProductName(alias.supplierName) ===
        normalizeProductName(nfeItem.description),
    ),
  );
  if (aliasNameMatches.length === 1) {
    return {
      orderItemId: aliasNameMatches[0].id,
      method: "supplier-name",
      confidence: 1,
    };
  }

  const exactMatches = orderItems.filter(
    (item) =>
      normalizeProductName(item.productName) ===
      normalizeProductName(nfeItem.description),
  );
  if (exactMatches.length === 1) {
    return {
      orderItemId: exactMatches[0].id,
      method: "exact-name",
      confidence: 0.95,
    };
  }

  const ranked = orderItems
    .map((item) => ({
      item,
      score: nameSimilarity(item.productName, nfeItem.description),
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (
    best &&
    best.score >= 0.6 &&
    (!runnerUp || best.score - runnerUp.score >= 0.12)
  ) {
    return {
      orderItemId: best.item.id,
      method: "similar-name",
      confidence: best.score,
    };
  }
  return null;
}

const UNIT_ALIASES: Record<string, string> = {
  UN: "UN",
  UND: "UN",
  UNID: "UN",
  UNIDADE: "UN",
  PC: "UN",
  PÇ: "UN",
  KG: "KG",
  KGM: "KG",
  QUILO: "KG",
  G: "G",
  GR: "G",
  GRAMA: "G",
  CX: "CX",
  CAIXA: "CX",
  PCT: "PCT",
  PACOTE: "PCT",
  FD: "FD",
  FARDO: "FD",
  L: "L",
  LT: "L",
  LITRO: "L",
  ML: "ML",
};

export function normalizedNfeUnit(unit: string | null | undefined) {
  const normalized = String(unit ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ç]/gi, "")
    .toUpperCase();
  return UNIT_ALIASES[normalized] ?? normalized;
}

export function nfeQuantityForUnit(item: NfeItem, unit: string) {
  const wanted = normalizedNfeUnit(unit);
  if (wanted && normalizedNfeUnit(item.commercialUnit) === wanted) {
    return item.commercialQuantity;
  }
  if (wanted && normalizedNfeUnit(item.tributaryUnit) === wanted) {
    return item.tributaryQuantity;
  }
  return null;
}

export function nfePriceForUnit(item: NfeItem, unit: string) {
  const wanted = normalizedNfeUnit(unit);
  if (wanted && normalizedNfeUnit(item.commercialUnit) === wanted) {
    return item.commercialUnitPrice;
  }
  if (wanted && normalizedNfeUnit(item.tributaryUnit) === wanted) {
    return item.tributaryUnitPrice;
  }
  return null;
}
