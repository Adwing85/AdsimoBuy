import { round2 } from './text';

export interface PricePoint {
  date: number;
  unitPrice: number;
  storeId?: number;
  storeName?: string;
}

export interface PriceStats {
  count: number;
  last: number;
  lastDate: number;
  min: number;
  max: number;
  avg: number;
  /** Letzter Preis relativ zum Durchschnitt der vorherigen Käufe, z. B. 0.12 = +12 %. */
  trend: number | null;
  cheapestStore?: { storeId?: number; storeName?: string; avg: number };
}

export function priceStats(points: readonly PricePoint[]): PriceStats | null {
  const valid = points.filter((p) => Number.isFinite(p.unitPrice) && p.unitPrice > 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a.date - b.date);
  const prices = sorted.map((p) => p.unitPrice);
  const last = sorted[sorted.length - 1];
  const previous = prices.slice(0, -1);
  const prevAvg = previous.length ? previous.reduce((s, p) => s + p, 0) / previous.length : null;

  const byStore = new Map<string, { storeId?: number; storeName?: string; sum: number; n: number }>();
  for (const p of sorted) {
    const key = String(p.storeId ?? p.storeName ?? '?');
    const entry = byStore.get(key) ?? { storeId: p.storeId, storeName: p.storeName, sum: 0, n: 0 };
    entry.sum += p.unitPrice;
    entry.n += 1;
    byStore.set(key, entry);
  }
  let cheapest: PriceStats['cheapestStore'];
  if (byStore.size > 1) {
    for (const s of byStore.values()) {
      const avg = s.sum / s.n;
      if (!cheapest || avg < cheapest.avg) cheapest = { storeId: s.storeId, storeName: s.storeName, avg: round2(avg) };
    }
  }

  return {
    count: sorted.length,
    last: last.unitPrice,
    lastDate: last.date,
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: round2(prices.reduce((s, p) => s + p, 0) / prices.length),
    trend: prevAvg ? (last.unitPrice - prevAvg) / prevAvg : null,
    cheapestStore: cheapest,
  };
}

/** Schätzt die Summe einer Einkaufsliste aus den zuletzt bezahlten Stückpreisen. */
export function estimateTotal(
  entries: ReadonlyArray<{ unitPrice: number | undefined; multiplier: number }>,
): { total: number; known: number; unknown: number } {
  let total = 0;
  let known = 0;
  let unknown = 0;
  for (const e of entries) {
    if (e.unitPrice !== undefined && e.unitPrice > 0) {
      total += e.unitPrice * e.multiplier;
      known++;
    } else {
      unknown++;
    }
  }
  return { total: round2(total), known, unknown };
}
