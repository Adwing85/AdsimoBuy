import { normalize } from './text';

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sørensen-Dice-Koeffizient auf Zeichen-Bigrammen (0..1). */
export function diceSimilarity(a: string, b: string): number {
  const x = normalize(a).replace(/ /g, '');
  const y = normalize(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  for (const [g, n] of bx) overlap += Math.min(n, by.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/**
 * Ähnlichkeit für abgekürzte Bon-Bezeichnungen: "VOLLM. 3,5%" passt zu "Vollmilch 3,5 %",
 * weil jedes Bon-Wort ein Präfix eines Produktwortes ist.
 */
export function abbreviationSimilarity(receiptName: string, productName: string): number {
  const rt = normalize(receiptName).split(' ').filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  const pt = normalize(productName).split(' ').filter((t) => t.length >= 2);
  if (rt.length === 0 || pt.length === 0) return 0;
  let matched = 0;
  for (const r of rt) {
    if (pt.some((p) => (r.length >= 3 && p.startsWith(r)) || (p.length >= 3 && r.startsWith(p)) || p === r)) {
      matched++;
    } else if (pt.some((p) => r.length >= 4 && p.includes(r))) {
      matched += 0.7;
    }
  }
  return matched / rt.length;
}

export function nameSimilarity(a: string, b: string): number {
  return Math.max(diceSimilarity(a, b), abbreviationSimilarity(a, b) * 0.92);
}

export interface MatchCandidate {
  id: number;
  name: string;
  brand?: string;
  aliases?: string[];
}

export interface MatchResult {
  id: number;
  score: number;
  /** "alias" = exakt bekannte Bon-Bezeichnung, "name" = exakter Name, "fuzzy" = Ähnlichkeit. */
  via: 'alias' | 'name' | 'fuzzy';
}

export const MATCH_THRESHOLD = 0.62;

/** Findet das passendste gespeicherte Produkt zu einer (Bon-)Bezeichnung. */
export function findBestMatch(name: string, candidates: readonly MatchCandidate[]): MatchResult | null {
  const key = normalize(name);
  if (!key) return null;

  for (const c of candidates) {
    if (c.aliases?.some((a) => normalize(a) === key)) return { id: c.id, score: 1, via: 'alias' };
  }
  for (const c of candidates) {
    if (normalize(c.name) === key) return { id: c.id, score: 1, via: 'name' };
  }

  let best: MatchResult | null = null;
  for (const c of candidates) {
    const names = [c.name, ...(c.brand ? [`${c.brand} ${c.name}`] : []), ...(c.aliases ?? [])];
    const score = Math.max(...names.map((n) => nameSimilarity(name, n)));
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { id: c.id, score, via: 'fuzzy' };
  }
  return best;
}

export interface ListItemCandidate {
  id: number;
  name: string;
  category: string;
  productId?: number;
}

export interface ItemMatch {
  id: number;
  score: number;
}

/** Ab diesem Wert wird ein Listeneintrag beim Scannen automatisch vorausgewählt. */
export const ITEM_MATCH_THRESHOLD = 0.6;

/**
 * Ordnet ein gescanntes Produkt den offenen Listeneinträgen zu: bereits verknüpftes Produkt,
 * dann Namensähnlichkeit ("Milch" ↔ "Vollmilch 3,5 %"), dann gleiche Kategorie als schwaches Signal.
 */
export function rankItemsForProduct(
  product: { id?: number; name: string; brand?: string; category: string },
  items: readonly ListItemCandidate[],
): ItemMatch[] {
  const productText = normalize(`${product.brand ?? ''} ${product.name}`);
  const sameCategory = items.filter((i) => i.category === product.category);
  return items
    .map((item) => {
      if (product.id !== undefined && item.productId === product.id) return { id: item.id, score: 1 };
      const itemKey = normalize(item.name);
      const itemTokens = itemKey.split(' ').filter((t) => t.length >= 3);
      // Alle Wörter des Listeneintrags stecken im Produktnamen ("Milch" in "Vollmilch").
      const contained = itemTokens.length > 0 && itemTokens.every((t) => productText.includes(t)) ? 0.85 : 0;
      let score = Math.max(contained, nameSimilarity(item.name, product.name), product.brand ? nameSimilarity(item.name, `${product.brand} ${product.name}`) : 0);
      if (item.category === product.category) score += sameCategory.length === 1 ? 0.35 : 0.1;
      return { id: item.id, score: Math.min(0.99, score) };
    })
    .sort((a, b) => b.score - a.score);
}
