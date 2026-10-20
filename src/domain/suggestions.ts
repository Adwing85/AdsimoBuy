const DAY = 24 * 60 * 60 * 1000;

export interface PurchaseHistory {
  productId: number;
  name: string;
  /** Kauftage als YYYY-MM-DD. */
  days: readonly string[];
}

export interface RepurchaseSuggestion {
  productId: number;
  name: string;
  intervalDays: number;
  daysSinceLast: number;
  /** >= 1 bedeutet: übliches Kaufintervall erreicht. */
  dueRatio: number;
}

function dayToTs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Nachkauf-Vorschläge: Produkte, die regelmäßig gekauft werden und deren übliches
 * Intervall (Median der Abstände) fast erreicht ist.
 */
export function repurchaseSuggestions(
  histories: readonly PurchaseHistory[],
  now: number,
  options: { excludeIds?: ReadonlySet<number>; limit?: number; minPurchases?: number } = {},
): RepurchaseSuggestion[] {
  const { excludeIds, limit = 8, minPurchases = 3 } = options;
  const result: RepurchaseSuggestion[] = [];
  for (const h of histories) {
    if (excludeIds?.has(h.productId)) continue;
    const ts = [...new Set(h.days)].map(dayToTs).sort((a, b) => a - b);
    if (ts.length < minPurchases) continue;
    const gaps = ts.slice(1).map((t, i) => (t - ts[i]) / DAY);
    const interval = median(gaps);
    if (interval < 1) continue;
    const since = (now - ts[ts.length - 1]) / DAY;
    const dueRatio = since / interval;
    // Nicht vorschlagen, wenn das Produkt seit über dem Dreifachen des Intervalls nicht mehr gekauft wurde.
    if (dueRatio >= 0.85 && dueRatio <= 3) {
      result.push({ productId: h.productId, name: h.name, intervalDays: Math.round(interval), daysSinceLast: Math.floor(since), dueRatio });
    }
  }
  return result.sort((a, b) => b.dueRatio - a.dueRatio).slice(0, limit);
}
