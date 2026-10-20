import type { CategoryId } from './categories';
import { completeOrder } from './stores';

export interface CheckEventLike {
  tripKey: string;
  category: CategoryId;
  at: number;
}

export interface LearnedOrder {
  order: CategoryId[];
  trips: number;
  /** Kategorien, deren Position aus echten Einkäufen stammt. */
  observed: CategoryId[];
}

export const MIN_TRIPS_FOR_LEARNING = 2;

/**
 * Lernt die Laufreihenfolge eines Marktes aus der Reihenfolge, in der Artikel abgehakt wurden.
 * Pro Einkauf zählt das erste Abhaken je Kategorie; die normierte Position (0 = Eingang, 1 = Kasse)
 * wird über alle Einkäufe gemittelt. Nie beobachtete Kategorien behalten ihre relative Lage.
 */
export function learnOrder(events: readonly CheckEventLike[], currentOrder: readonly CategoryId[]): LearnedOrder | null {
  const byTrip = new Map<string, CheckEventLike[]>();
  for (const e of events) {
    const list = byTrip.get(e.tripKey) ?? [];
    list.push(e);
    byTrip.set(e.tripKey, list);
  }

  const sums = new Map<CategoryId, { sum: number; n: number }>();
  let trips = 0;
  for (const list of byTrip.values()) {
    const seq: CategoryId[] = [];
    for (const e of [...list].sort((a, b) => a.at - b.at)) {
      if (!seq.includes(e.category)) seq.push(e.category);
    }
    if (seq.length < 2) continue;
    trips++;
    seq.forEach((c, i) => {
      const pos = i / (seq.length - 1);
      const s = sums.get(c) ?? { sum: 0, n: 0 };
      s.sum += pos;
      s.n += 1;
      sums.set(c, s);
    });
  }
  if (trips < MIN_TRIPS_FOR_LEARNING) return null;

  const base = completeOrder(currentOrder);
  const n = base.length;
  const scored = base.map((c, i) => {
    const s = sums.get(c);
    return { c, score: s ? s.sum / s.n : i / (n - 1), observed: Boolean(s), i };
  });

  // Beobachtete Kategorien nach gelernter Position sortieren und in die Slots der
  // beobachteten Kategorien einsetzen; unbeobachtete bleiben auf ihrem Platz.
  const observedSorted = scored.filter((s) => s.observed).sort((a, b) => a.score - b.score || a.i - b.i);
  let k = 0;
  const order = scored.map((s) => (s.observed ? observedSorted[k++].c : s.c));

  return { order, trips, observed: observedSorted.map((s) => s.c) };
}
