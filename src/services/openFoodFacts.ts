import { classifyByKeywords, classifyByOffTags, type CategoryId } from '../domain/categories';
import type { Nutriments } from '../db/types';

const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'generic_name_de',
  'brands',
  'quantity',
  'categories_tags',
  'image_front_small_url',
  'image_front_url',
  'image_url',
  'nutriments',
  'nutriscore_grade',
  'nova_group',
  'ingredients_text_de',
  'ingredients_text',
  'allergens_tags',
].join(',');

interface OffRawProduct {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  generic_name_de?: string;
  brands?: string | string[];
  quantity?: string;
  categories_tags?: string[];
  image_front_small_url?: string;
  image_front_url?: string;
  image_url?: string;
  nutriments?: Record<string, number | string>;
  nutriscore_grade?: string;
  nova_group?: number;
  ingredients_text_de?: string;
  ingredients_text?: string;
  allergens_tags?: string[];
}

export interface OffProduct {
  barcode: string;
  name: string;
  brand?: string;
  quantity?: string;
  category: CategoryId;
  imageUrl?: string;
  nutriments?: Nutriments;
  nutriscore?: string;
  novaGroup?: number;
  ingredients?: string;
  allergens?: string[];
}

const MAIN_KEYS: Record<string, keyof Omit<Nutriments, 'extra'>> = {
  'energy-kcal': 'energyKcal',
  'energy-kj': 'energyKj',
  fat: 'fat',
  'saturated-fat': 'saturatedFat',
  carbohydrates: 'carbohydrates',
  sugars: 'sugars',
  fiber: 'fiber',
  proteins: 'proteins',
  salt: 'salt',
};

/** Übernimmt alle *_100g-Werte; die wichtigsten typisiert, den Rest unter "extra". */
export function mapNutriments(raw: Record<string, number | string> | undefined): Nutriments | undefined {
  if (!raw) return undefined;
  const result: Nutriments = {};
  const extra: NonNullable<Nutriments['extra']> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.endsWith('_100g')) continue;
    const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(num)) continue;
    const base = key.slice(0, -'_100g'.length);
    const main = MAIN_KEYS[base];
    if (main) {
      result[main] = num;
    } else if (base !== 'energy' && base !== 'sodium' && !base.startsWith('nutrition-score') && !base.includes('fruits-vegetables')) {
      const unit = typeof raw[`${base}_unit`] === 'string' ? (raw[`${base}_unit`] as string) : 'g';
      extra[base] = { value: num, unit };
    }
  }
  if (result.energyKcal === undefined && typeof raw['energy_100g'] === 'number') {
    result.energyKcal = Math.round((raw['energy_100g'] as number) / 4.184);
  }
  if (Object.keys(extra).length) result.extra = extra;
  return Object.keys(result).length ? result : undefined;
}

function mapProduct(raw: OffRawProduct): OffProduct | null {
  const name = (raw.product_name_de || raw.product_name || raw.generic_name_de || '').trim();
  if (!raw.code || !name) return null;
  const brand = Array.isArray(raw.brands) ? raw.brands[0] : raw.brands?.split(',')[0];
  const grade = raw.nutriscore_grade?.toLowerCase();
  return {
    barcode: raw.code,
    name,
    brand: brand?.trim() || undefined,
    quantity: raw.quantity?.trim() || undefined,
    category: classifyByOffTags(raw.categories_tags) ?? classifyByKeywords(name) ?? 'sonstiges',
    imageUrl: raw.image_front_small_url || raw.image_front_url || raw.image_url,
    nutriments: mapNutriments(raw.nutriments),
    nutriscore: grade && /^[a-e]$/.test(grade) ? grade : undefined,
    novaGroup: typeof raw.nova_group === 'number' ? raw.nova_group : undefined,
    ingredients: (raw.ingredients_text_de || raw.ingredients_text)?.trim() || undefined,
    allergens: raw.allergens_tags?.map((t) => t.replace(/^\w\w:/, '')),
  };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts antwortet mit ${res.status}`);
  return (await res.json()) as T;
}

/** Produkt per Barcode laden. Liefert null, wenn OFF das Produkt nicht kennt. */
export async function fetchProductByBarcode(barcode: string, signal?: AbortSignal): Promise<OffProduct | null> {
  const data = await fetchJson<{ status?: number; product?: OffRawProduct }>(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}&lc=de`,
    signal,
  );
  if (!data.product || data.status === 0) return null;
  return mapProduct({ ...data.product, code: data.product.code ?? barcode });
}

/** Freitextsuche (z. B. um einem Bon-Produkt nachträglich Nährwerte zuzuordnen). */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const q = encodeURIComponent(query.trim());
  const attempts = [
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=15&lc=de&fields=${FIELDS}`,
    `https://search.openfoodfacts.org/search?q=${q}&page_size=15&langs=de&fields=${FIELDS}`,
  ];
  let lastError: unknown;
  for (const url of attempts) {
    try {
      const data = await fetchJson<{ products?: OffRawProduct[]; hits?: OffRawProduct[] }>(url, signal);
      const list = data.products ?? data.hits ?? [];
      return list.map(mapProduct).filter((p): p is OffProduct => p !== null);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Suche fehlgeschlagen');
}

/** Deutsche Bezeichnungen für häufige Zusatz-Nährstoffe. */
export const EXTRA_NUTRIENT_LABELS: Record<string, string> = {
  'monounsaturated-fat': 'Einfach ungesättigte Fettsäuren',
  'polyunsaturated-fat': 'Mehrfach ungesättigte Fettsäuren',
  'trans-fat': 'Transfette',
  cholesterol: 'Cholesterin',
  polyols: 'Mehrwertige Alkohole',
  starch: 'Stärke',
  lactose: 'Laktose',
  alcohol: 'Alkohol',
  caffeine: 'Koffein',
  'vitamin-a': 'Vitamin A',
  'vitamin-d': 'Vitamin D',
  'vitamin-e': 'Vitamin E',
  'vitamin-k': 'Vitamin K',
  'vitamin-c': 'Vitamin C',
  'vitamin-b1': 'Vitamin B1',
  'vitamin-b2': 'Vitamin B2',
  'vitamin-pp': 'Niacin',
  'vitamin-b6': 'Vitamin B6',
  'vitamin-b9': 'Folsäure',
  'vitamin-b12': 'Vitamin B12',
  biotin: 'Biotin',
  'pantothenic-acid': 'Pantothensäure',
  potassium: 'Kalium',
  calcium: 'Calcium',
  phosphorus: 'Phosphor',
  iron: 'Eisen',
  magnesium: 'Magnesium',
  zinc: 'Zink',
  copper: 'Kupfer',
  manganese: 'Mangan',
  fluoride: 'Fluorid',
  selenium: 'Selen',
  iodine: 'Jod',
  chloride: 'Chlorid',
  omega_3_fat: 'Omega-3-Fettsäuren',
  'omega-3-fat': 'Omega-3-Fettsäuren',
  'omega-6-fat': 'Omega-6-Fettsäuren',
  'added-sugars': 'Zugesetzter Zucker',
  'carbon-footprint-from-known-ingredients': 'CO₂-Fußabdruck (Zutaten)',
};
