import "server-only";

import { cache } from "react";

import { carregarAlocacao } from "@/features/rounds/alocacao";
import { requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RoundReportOffer = {
  supplierId: string;
  supplierName: string;
  quotedPrice: number | null;
  finalPrice: number | null;
  doesNotSupply: boolean;
  isAvailable: boolean | null;
  wonQuantity: number;
  estimatedPricingQuantity: number | null;
  selectedPrice: number | null;
  negotiatedSavings: number | null;
  outcome: "won" | "lost" | "unavailable" | "no_response";
};

export type RoundReportItem = {
  id: string;
  productName: string;
  groupName: string;
  requestedQuantity: number;
  purchaseUnit: string;
  pricingUnit: string;
  commercialStatus: string;
  offers: RoundReportOffer[];
};

export type RoundReportSupplier = {
  id: string;
  name: string;
  wins: number;
  losses: number;
  noResponses: number;
  unavailable: number;
  awardedValue: number;
  uncalculatedWins: number;
};

export type RoundReportRealizationItem = {
  orderRevisionItemId: string;
  orderId: string;
  orderNumber: number;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  requestedQuantity: number;
  purchaseUnit: string;
  pricingUnit: string;
  receivedQuantity: number;
  receivedPricingQuantity: number;
  quotedPrice: number | null;
  agreedPrice: number;
  practicedPrice: number | null;
  negotiatedSavingsOnReceived: number | null;
  realizedSavings: number | null;
  divergenceImpact: number | null;
  receiptStatus: "pending" | "partial" | "received";
  receiptCount: number;
  lastReceivedAt: string | null;
};

export type RoundReportRealization = {
  calculatedAt: string;
  lastReceiptAt: string | null;
  summary: {
    orderedItemCount: number;
    receivedItemCount: number;
    calculableReceivedItemCount: number;
    fullyReceivedItemCount: number;
    partiallyReceivedItemCount: number;
    pendingItemCount: number;
    postedReceiptCount: number;
    negotiatedSavingsOnReceived: number;
    realizedSavings: number;
    divergenceImpact: number;
    actualCost: number;
  };
  items: RoundReportRealizationItem[];
};

export type RoundReport = {
  companyName: string;
  round: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    notes: string | null;
  };
  generatedAt: string;
  items: RoundReportItem[];
  groups: { name: string; items: RoundReportItem[] }[];
  suppliers: RoundReportSupplier[];
  summary: {
    itemCount: number;
    purchasedItemCount: number;
    withoutPurchaseCount: number;
    supplierCount: number;
    winnerCount: number;
    estimatedAwardedValue: number;
    negotiatedSavings: number;
    /** Resultado separado, exclusivo da escolha entre apresentações de embalagem. */
    packagingChoiceResult: number;
    calculablePurchasedItems: number;
  };
  /** Posição dinâmica; o snapshot comercial acima continua imutável. */
  realization: RoundReportRealization | null;
};

function hasRoundReportShape(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.companyName === "string" &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.groups) &&
    Array.isArray(candidate.suppliers) &&
    Boolean(candidate.round && typeof candidate.round === "object") &&
    Boolean(candidate.summary && typeof candidate.summary === "object")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function normalizeRealization(value: unknown): RoundReportRealization | null {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.items)) {
    return null;
  }

  const summary = value.summary;
  return {
    calculatedAt: String(value.calculatedAt),
    lastReceiptAt:
      value.lastReceiptAt === null || value.lastReceiptAt === undefined
        ? null
        : String(value.lastReceiptAt),
    summary: {
      orderedItemCount: Number(summary.orderedItemCount ?? 0),
      receivedItemCount: Number(summary.receivedItemCount ?? 0),
      calculableReceivedItemCount: Number(
        summary.calculableReceivedItemCount ?? 0,
      ),
      fullyReceivedItemCount: Number(summary.fullyReceivedItemCount ?? 0),
      partiallyReceivedItemCount: Number(
        summary.partiallyReceivedItemCount ?? 0,
      ),
      pendingItemCount: Number(summary.pendingItemCount ?? 0),
      postedReceiptCount: Number(summary.postedReceiptCount ?? 0),
      negotiatedSavingsOnReceived: Number(
        summary.negotiatedSavingsOnReceived ?? 0,
      ),
      realizedSavings: Number(summary.realizedSavings ?? 0),
      divergenceImpact: Number(summary.divergenceImpact ?? 0),
      actualCost: Number(summary.actualCost ?? 0),
    },
    items: value.items.filter(isRecord).map((item) => ({
      orderRevisionItemId: String(item.orderRevisionItemId),
      orderId: String(item.orderId),
      orderNumber: Number(item.orderNumber),
      supplierId: String(item.supplierId),
      supplierName: String(item.supplierName),
      productId: String(item.productId),
      productName: String(item.productName),
      requestedQuantity: Number(item.requestedQuantity),
      purchaseUnit: String(item.purchaseUnit),
      pricingUnit: String(item.pricingUnit),
      receivedQuantity: Number(item.receivedQuantity),
      receivedPricingQuantity: Number(item.receivedPricingQuantity),
      quotedPrice: nullableNumber(item.quotedPrice),
      agreedPrice: Number(item.agreedPrice),
      practicedPrice: nullableNumber(item.practicedPrice),
      negotiatedSavingsOnReceived: nullableNumber(
        item.negotiatedSavingsOnReceived,
      ),
      realizedSavings: nullableNumber(item.realizedSavings),
      divergenceImpact: nullableNumber(item.divergenceImpact),
      receiptStatus: item.receiptStatus as RoundReportRealizationItem["receiptStatus"],
      receiptCount: Number(item.receiptCount),
      lastReceivedAt:
        item.lastReceivedAt === null || item.lastReceivedAt === undefined
          ? null
          : String(item.lastReceivedAt),
    })),
  };
}

function normalizeReportOffer(value: unknown) {
  if (!isRecord(value)) return value;
  const outcome = value.outcome === "no_price" ? "no_response" : value.outcome;
  const quoted = value.quotedPrice;
  const selected = value.selectedPrice;
  const quantity = value.estimatedPricingQuantity;
  const negotiatedSavings =
    outcome === "won" &&
    typeof quoted === "number" &&
    typeof selected === "number" &&
    typeof quantity === "number"
      ? (quoted - selected) * quantity
      : null;

  return { ...value, outcome, negotiatedSavings };
}

function normalizeReportItem(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.offers)) return value;
  return { ...value, offers: value.offers.map(normalizeReportOffer) };
}

/**
 * Snapshots comerciais são imutáveis. Esta adaptação mantém compatibilidade
 * com documentos antigos, que chamavam uma ausência de resposta de
 * `no_price`, sem reescrever o histórico já congelado.
 */
function normalizeRoundReport(value: unknown): RoundReport | null {
  if (!hasRoundReportShape(value)) return null;
  const report = value as Record<string, unknown>;
  const items = (report.items as unknown[]).map(normalizeReportItem);
  const summary = isRecord(report.summary) ? report.summary : {};
  const negotiatedSavings = items.reduce((total, rawItem) => {
    if (!isRecord(rawItem) || !Array.isArray(rawItem.offers)) return total;
    return (
      total +
      rawItem.offers.reduce((offerTotal, rawOffer) => {
        if (!isRecord(rawOffer)) return offerTotal;
        return offerTotal + Number(rawOffer.negotiatedSavings ?? 0);
      }, 0)
    );
  }, 0);

  return {
    ...report,
    items,
    groups: (report.groups as unknown[]).map((group) =>
      isRecord(group) && Array.isArray(group.items)
        ? { ...group, items: group.items.map(normalizeReportItem) }
        : group,
    ),
    suppliers: (report.suppliers as unknown[]).map((supplier) => {
      if (!isRecord(supplier)) return supplier;
      const legacyCount = supplier.noPrice;
      return {
        ...supplier,
        noResponses:
          typeof supplier.noResponses === "number"
            ? supplier.noResponses
            : typeof legacyCount === "number"
              ? legacyCount
              : 0,
      };
    }),
    summary: { ...summary, negotiatedSavings },
  } as RoundReport;
}

/**
 * DTO do relatório gerencial. Nenhum Map ou registro cru do banco atravessa a
 * fronteira: página e download recebem somente os campos que realmente usam.
 */
export const getRoundReport = cache(
  async (roundId: string): Promise<RoundReport | null> => {
    const company = await requireActiveCompany();
    const supabase = await createServerSupabaseClient();
    // Rodada concluída lê o documento congelado pela trigger. Durante uma
    // implantação em que o código chegue segundos antes da migration, a RPC
    // pode ainda não existir; nesse intervalo a prévia dinâmica continua
    // funcionando e não derruba a tela.
    const [snapshot, packagingChoice, realizationResult] = await Promise.all([
      supabase.rpc("rpc_get_purchase_round_report", {
        p_company_id: company.companyId,
        p_purchase_round_id: roundId,
      }),
      supabase
        .from("purchase_allocations")
        .select("packaging_choice_result_estimated")
        .eq("company_id", company.companyId)
        .eq("purchase_round_id", roundId)
        .eq("status", "confirmed"),
      supabase.rpc("rpc_get_purchase_round_realization", {
        p_company_id: company.companyId,
        p_purchase_round_id: roundId,
      }),
    ]);
    if (packagingChoice.error) {
      throw new Error(
        `Falha ao calcular escolha de embalagens: ${packagingChoice.error.message}`,
      );
    }
    const packagingChoiceResult = (packagingChoice.data ?? []).reduce(
      (sum, allocation) =>
        sum + Number(allocation.packaging_choice_result_estimated ?? 0),
      0,
    );
    if (
      realizationResult.error &&
      !["42883", "PGRST202"].includes(realizationResult.error.code)
    ) {
      throw new Error(
        `Falha ao calcular o resultado realizado: ${realizationResult.error.message}`,
      );
    }
    const realization = normalizeRealization(realizationResult.data);
    if (!snapshot.error) {
      const report = normalizeRoundReport(snapshot.data);
      if (report) {
        return {
          ...report,
          summary: { ...report.summary, packagingChoiceResult },
          realization,
        };
      }
    }

    const dados = await carregarAlocacao(roundId);
    if (!dados || !dados.podeVer) return null;

    const items: RoundReportItem[] = dados.rows.map((row) => {
      const decisions = (dados.allocationsByItem.get(row.itemId) ?? []).filter(
        (allocation) => allocation.status === "confirmed",
      );

      const offers = dados.suppliers
        .filter(
          (supplier) =>
            row.supplierQuotationItemBySupplier.has(supplier.id) ||
            row.cells.has(supplier.id),
        )
        .map((supplier): RoundReportOffer => {
          const cell = row.cells.get(supplier.id);
          const wins = decisions.filter(
            (allocation) => allocation.supplierId === supplier.supplier_id,
          );
          const wonQuantity = wins.reduce(
            (sum, allocation) => sum + allocation.allocatedQuantity,
            0,
          );
          const estimatedParts = wins.map(
            (allocation) => allocation.estimatedPricingQuantity,
          );
          const calculable =
            wins.length > 0 &&
            estimatedParts.every((quantity) => quantity !== null);
          const estimatedPricingQuantity = calculable
            ? estimatedParts.reduce<number>(
                (sum, quantity) => sum + Number(quantity),
                0,
              )
            : null;
          const selectedPrice =
            wins.length === 0
              ? null
              : calculable && estimatedPricingQuantity !== null
                ? wins.reduce(
                    (sum, allocation) =>
                      sum +
                      allocation.selectedPrice *
                        (allocation.estimatedPricingQuantity ?? 0),
                    0,
                  ) / estimatedPricingQuantity
                : wins.reduce(
                    (sum, allocation) =>
                      sum +
                      allocation.selectedPrice * allocation.allocatedQuantity,
                    0,
                  ) / wonQuantity;
          const negotiatedSavings =
            selectedPrice !== null &&
            cell?.quotedPrice !== null &&
            cell?.quotedPrice !== undefined &&
            estimatedPricingQuantity !== null
              ? (cell.quotedPrice - selectedPrice) * estimatedPricingQuantity
              : null;
          const hasPrice =
            cell?.currentPrice !== null && cell?.currentPrice !== undefined;

          return {
            supplierId: supplier.supplier_id,
            supplierName: supplier.suppliers.name,
            quotedPrice: cell?.quotedPrice ?? null,
            finalPrice: cell?.currentPrice ?? null,
            doesNotSupply: cell?.doesNotSupply ?? false,
            isAvailable: cell?.isAvailable ?? null,
            wonQuantity,
            estimatedPricingQuantity,
            selectedPrice,
            negotiatedSavings,
            outcome:
              wins.length > 0
                ? "won"
                : cell?.doesNotSupply || cell?.isAvailable === false
                  ? "unavailable"
                  : hasPrice
                    ? "lost"
                    : "no_response",
          };
        });

      return {
        id: row.itemId,
        productName: row.productName,
        groupName: row.groupName,
        requestedQuantity: row.requestedQuantity,
        purchaseUnit: row.purchaseUnit,
        pricingUnit: row.pricingUnit,
        commercialStatus: row.commercialStatus,
        offers,
      };
    });

    const suppliers: RoundReportSupplier[] = dados.suppliers
      .map((supplier) => {
        const offers = items.flatMap((item) =>
          item.offers.filter(
            (offer) => offer.supplierId === supplier.supplier_id,
          ),
        );
        return {
          id: supplier.supplier_id,
          name: supplier.suppliers.name,
          wins: offers.filter((offer) => offer.outcome === "won").length,
          losses: offers.filter((offer) => offer.outcome === "lost").length,
          noResponses: offers.filter((offer) => offer.outcome === "no_response")
            .length,
          unavailable: offers.filter((offer) => offer.outcome === "unavailable")
            .length,
          awardedValue: offers.reduce(
            (sum, offer) =>
              sum +
              (offer.estimatedPricingQuantity ?? 0) *
                (offer.selectedPrice ?? 0),
            0,
          ),
          uncalculatedWins: offers.filter(
            (offer) =>
              offer.outcome === "won" &&
              offer.estimatedPricingQuantity === null,
          ).length,
        };
      })
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.awardedValue - a.awardedValue ||
          a.name.localeCompare(b.name),
      );

    const groupMap = new Map<string, RoundReportItem[]>();
    for (const item of items) {
      const list = groupMap.get(item.groupName) ?? [];
      list.push(item);
      groupMap.set(item.groupName, list);
    }

    const purchasedItems = items.filter((item) =>
      item.offers.some((offer) => offer.outcome === "won"),
    );
    const calculablePurchasedItems = purchasedItems.filter((item) =>
      item.offers
        .filter((offer) => offer.outcome === "won")
        .every((offer) => offer.estimatedPricingQuantity !== null),
    ).length;

    return {
      companyName: dados.companyName,
      round: {
        id: dados.round.id,
        title: dados.round.title,
        status: dados.round.status,
        createdAt: dados.round.created_at,
        startedAt: dados.round.started_at,
        completedAt: dados.round.completed_at,
        notes: dados.round.notes,
      },
      generatedAt: new Date().toISOString(),
      items,
      groups: [...groupMap.entries()].map(([name, groupItems]) => ({
        name,
        items: groupItems,
      })),
      suppliers,
      summary: {
        itemCount: items.length,
        purchasedItemCount: purchasedItems.length,
        withoutPurchaseCount: items.filter(
          (item) => item.commercialStatus === "closed_without_purchase",
        ).length,
        supplierCount: suppliers.length,
        winnerCount: suppliers.filter((supplier) => supplier.wins > 0).length,
        estimatedAwardedValue: suppliers.reduce(
          (sum, supplier) => sum + supplier.awardedValue,
          0,
        ),
        negotiatedSavings: items.reduce(
          (sum, item) =>
            sum +
            item.offers.reduce(
              (offerSum, offer) => offerSum + (offer.negotiatedSavings ?? 0),
              0,
            ),
          0,
        ),
        packagingChoiceResult,
        calculablePurchasedItems,
      },
      realization,
    };
  },
);
