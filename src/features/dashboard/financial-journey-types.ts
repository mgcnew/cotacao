export type FinancialJourneyMetric = "realized" | "divergence";

export type FinancialJourneyItem = {
  productId: string | null;
  productName: string;
  quoted: number | null;
  agreed: number;
  practiced: number;
  quantity: number;
  contribution: number;
};

export type FinancialJourneyEvent = {
  receiptId: string | null;
  receivedAt: string;
  supplierId: string | null;
  supplierName: string;
  orderId: string | null;
  orderNumber: number | null;
  contribution: number;
  balanceBefore: number;
  balanceAfter: number;
  items: FinancialJourneyItem[];
};

export type FinancialJourney = {
  metric: FinancialJourneyMetric;
  de: string;
  ate: string;
  total: number;
  itemCount: number;
  events: FinancialJourneyEvent[];
};
