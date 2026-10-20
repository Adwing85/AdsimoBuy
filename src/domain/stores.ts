import { CATEGORY_IDS, type CategoryId } from './categories';
import { normalize } from './text';

export type ChainId =
  | 'lidl'
  | 'aldi_sued'
  | 'aldi_nord'
  | 'rewe'
  | 'edeka'
  | 'kaufland'
  | 'penny'
  | 'netto'
  | 'dm'
  | 'rossmann'
  | 'other';

export interface ChainPreset {
  label: string;
  color: string;
  /** Typischer Laufweg ab Eingang. Fehlende Kategorien werden hinten angehängt. */
  order: CategoryId[];
  /** Erkennungsmerkmale auf dem Kassenbon; "^" = nur im Bonkopf suchen (z. B. "Netto" steht auch in der MwSt-Zeile). */
  receiptKeywords: string[];
}

const DISCOUNTER_REST: CategoryId[] = [
  'grundnahrung', 'konserven', 'backzutaten', 'gewuerze', 'fruehstueck', 'kaffee_tee', 'suesswaren',
  'getraenke', 'alkohol', 'drogerie', 'haushalt', 'baby', 'tier', 'nonfood',
];

export const CHAINS: Record<ChainId, ChainPreset> = {
  lidl: {
    label: 'Lidl',
    color: '#0050aa',
    // Eingang: Obst & Gemüse, direkt danach Convenience und die Backstation.
    order: [
      'obst_gemuese', 'convenience', 'backwaren', 'molkerei', 'kaese', 'fleisch_wurst', 'fisch',
      ...DISCOUNTER_REST, 'tiefkuehl', 'sonstiges',
    ],
    receiptKeywords: ['lidl'],
  },
  aldi_sued: {
    label: 'Aldi Süd',
    color: '#00005f',
    order: [
      'obst_gemuese', 'backwaren', 'convenience', 'molkerei', 'kaese', 'fleisch_wurst', 'fisch', 'tiefkuehl',
      ...DISCOUNTER_REST, 'sonstiges',
    ],
    receiptKeywords: ['aldi sued', 'aldi sud', 'aldi s'],
  },
  aldi_nord: {
    label: 'Aldi Nord',
    color: '#1b75bb',
    order: [
      'obst_gemuese', 'backwaren', 'molkerei', 'kaese', 'fleisch_wurst', 'fisch', 'convenience',
      ...DISCOUNTER_REST, 'tiefkuehl', 'sonstiges',
    ],
    receiptKeywords: ['aldi nord', 'aldi'],
  },
  rewe: {
    label: 'REWE',
    color: '#cc071e',
    order: [
      'obst_gemuese', 'backwaren', 'convenience', 'kaese', 'fleisch_wurst', 'fisch', 'molkerei',
      'grundnahrung', 'konserven', 'gewuerze', 'backzutaten', 'fruehstueck', 'kaffee_tee', 'suesswaren',
      'drogerie', 'haushalt', 'baby', 'tier', 'tiefkuehl', 'getraenke', 'alkohol', 'nonfood', 'sonstiges',
    ],
    receiptKeywords: ['rewe'],
  },
  edeka: {
    label: 'EDEKA',
    color: '#1d4f91',
    order: [
      'obst_gemuese', 'backwaren', 'kaese', 'fleisch_wurst', 'fisch', 'convenience', 'molkerei',
      'grundnahrung', 'konserven', 'gewuerze', 'backzutaten', 'fruehstueck', 'kaffee_tee', 'suesswaren',
      'tiefkuehl', 'drogerie', 'haushalt', 'baby', 'tier', 'getraenke', 'alkohol', 'nonfood', 'sonstiges',
    ],
    receiptKeywords: ['edeka', 'e center', 'marktkauf'],
  },
  kaufland: {
    label: 'Kaufland',
    color: '#e10915',
    order: [
      'nonfood', 'drogerie', 'haushalt', 'baby', 'tier', 'obst_gemuese', 'backwaren', 'fleisch_wurst',
      'fisch', 'kaese', 'molkerei', 'convenience', 'grundnahrung', 'konserven', 'gewuerze', 'backzutaten',
      'fruehstueck', 'kaffee_tee', 'suesswaren', 'tiefkuehl', 'getraenke', 'alkohol', 'sonstiges',
    ],
    receiptKeywords: ['kaufland'],
  },
  penny: {
    label: 'PENNY',
    color: '#cd1414',
    order: [
      'obst_gemuese', 'backwaren', 'molkerei', 'kaese', 'fleisch_wurst', 'fisch', 'convenience',
      ...DISCOUNTER_REST, 'tiefkuehl', 'sonstiges',
    ],
    receiptKeywords: ['penny'],
  },
  netto: {
    label: 'Netto',
    color: '#ffd400',
    order: [
      'obst_gemuese', 'backwaren', 'molkerei', 'kaese', 'fleisch_wurst', 'fisch', 'convenience', 'tiefkuehl',
      ...DISCOUNTER_REST, 'sonstiges',
    ],
    receiptKeywords: ['netto marken discount', '^netto'],
  },
  dm: {
    label: 'dm',
    color: '#2b3a8c',
    order: [
      'drogerie', 'baby', 'haushalt', 'tier', 'fruehstueck', 'grundnahrung', 'backzutaten', 'kaffee_tee',
      'suesswaren', 'getraenke', 'nonfood', 'sonstiges',
    ],
    receiptKeywords: ['dm drogerie', 'dm markt', 'dm-drogerie', '^dm'],
  },
  rossmann: {
    label: 'Rossmann',
    color: '#c3002f',
    order: ['drogerie', 'baby', 'haushalt', 'tier', 'suesswaren', 'getraenke', 'fruehstueck', 'nonfood', 'sonstiges'],
    receiptKeywords: ['rossmann'],
  },
  other: {
    label: 'Anderer Markt',
    color: '#5f6b66',
    order: [
      'obst_gemuese', 'backwaren', 'convenience', 'molkerei', 'kaese', 'fleisch_wurst', 'fisch',
      ...DISCOUNTER_REST, 'tiefkuehl', 'sonstiges',
    ],
    receiptKeywords: [],
  },
};

export const CHAIN_IDS = Object.keys(CHAINS) as ChainId[];

/** Ergänzt fehlende Kategorien hinten, entfernt Duplikate und Unbekanntes. */
export function completeOrder(order: readonly string[]): CategoryId[] {
  const seen = new Set<CategoryId>();
  const result: CategoryId[] = [];
  for (const id of order) {
    if ((CATEGORY_IDS as readonly string[]).includes(id) && !seen.has(id as CategoryId)) {
      seen.add(id as CategoryId);
      result.push(id as CategoryId);
    }
  }
  for (const id of CATEGORY_IDS) {
    if (!seen.has(id)) {
      // "Sonstiges" bleibt immer ganz hinten.
      if (result[result.length - 1] === 'sonstiges') result.splice(result.length - 1, 0, id);
      else result.push(id);
    }
  }
  return result;
}

export function defaultOrderFor(chain: ChainId): CategoryId[] {
  return completeOrder(CHAINS[chain].order);
}

/** Erkennt die Handelskette anhand des Bon-Textes (bevorzugt die ersten Zeilen). */
export function detectChain(text: string): ChainId | null {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim());
  const lines = rawLines.map(normalize);
  // Der Marktname steht im Bonkopf; Zeilen mit Beträgen (z. B. "Netto 3,36") zählen dort nicht.
  const head = ` ${lines
    .slice(0, 6)
    .filter((_, i) => !/\d[.,]\d{2}\b/.test(rawLines[i]))
    .join(' ')} `;
  const all = ` ${lines.join(' ')} `;
  // Spezifische Varianten (Aldi Süd) vor allgemeinen (Aldi) prüfen.
  const candidates: Array<{ chain: ChainId; kw: string; headOnly: boolean }> = [];
  for (const chain of CHAIN_IDS) {
    for (const kw of CHAINS[chain].receiptKeywords) {
      candidates.push({ chain, kw: normalize(kw), headOnly: kw.startsWith('^') });
    }
  }
  candidates.sort((a, b) => b.kw.length - a.kw.length);
  for (const c of candidates) if (head.includes(` ${c.kw} `)) return c.chain;
  for (const c of candidates) if (!c.headOnly && all.includes(` ${c.kw} `)) return c.chain;
  return null;
}

/** Sortiert Einträge nach der Kategorie-Reihenfolge des Marktes, innerhalb der Kategorie alphabetisch. */
export function sortByStoreOrder<T extends { category: CategoryId; name: string }>(
  items: readonly T[],
  order: readonly CategoryId[],
): T[] {
  const rank = new Map(completeOrder(order).map((c, i) => [c, i]));
  return [...items].sort(
    (a, b) =>
      (rank.get(a.category) ?? 999) - (rank.get(b.category) ?? 999) ||
      a.name.localeCompare(b.name, 'de'),
  );
}

/** Gruppiert nach Kategorie in Markt-Reihenfolge. */
export function groupByStoreOrder<T extends { category: CategoryId; name: string }>(
  items: readonly T[],
  order: readonly CategoryId[],
): Array<{ category: CategoryId; items: T[] }> {
  const groups: Array<{ category: CategoryId; items: T[] }> = [];
  for (const item of sortByStoreOrder(items, order)) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }
  return groups;
}
