export type SaleLineInput = { productId: string; quantity: number; unitPrice: number };
export type SaleLine = SaleLineInput & { name: string; total: number };
export type SaleReceipt = { id: string; total: number; createdAt: string; items: SaleLine[] };
export type SalesMetrics = { revenue: number; units: number; sales: number };
export type SalesAnalytics = {
  from: string; to: string; current: SalesMetrics; previous: SalesMetrics;
  trend: ({ date: string } & SalesMetrics)[];
  bestSellers: { productId: string; name: string; units: number; revenue: number; stock: number | null }[];
  unsold: { productId: string; name: string; stock: number }[];
  lowStock: { productId: string; name: string; stock: number }[];
};
export function shopDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
