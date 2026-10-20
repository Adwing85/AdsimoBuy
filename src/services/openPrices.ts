import { detectChain, type ChainId } from '../domain/stores';

export interface CommunityPrice {
  price: number;
  date: number;
  chain: ChainId | null;
  storeName: string;
  city?: string;
  discounted: boolean;
}

interface RawPrice {
  price?: number;
  currency?: string;
  date?: string | null;
  created?: string;
  price_is_discounted?: boolean;
  location?: {
    osm_name?: string;
    osm_brand?: string;
    osm_address_city?: string;
    osm_address_country_code?: string;
    osm_address_country?: string;
  } | null;
}

/**
 * Community-Preise von Open Prices (prices.openfoodfacts.org) für einen Barcode,
 * beschränkt auf Euro-Preise aus Deutschland, neueste zuerst.
 */
export async function fetchCommunityPrices(barcode: string, signal?: AbortSignal): Promise<CommunityPrice[]> {
  const res = await fetch(
    `https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(barcode)}&order_by=-created&size=100`,
    { signal, headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`Open Prices antwortet mit ${res.status}`);
  const data = (await res.json()) as { items?: RawPrice[] };
  return (data.items ?? [])
    .filter((p) => {
      const loc = p.location;
      const german = loc?.osm_address_country_code === 'DE' || /deutschland|germany/i.test(loc?.osm_address_country ?? '');
      return p.currency === 'EUR' && typeof p.price === 'number' && p.price > 0 && german;
    })
    .map((p) => {
      const name = p.location?.osm_brand || p.location?.osm_name || 'Unbekannter Markt';
      const dateText = p.date || p.created;
      return {
        price: p.price!,
        date: dateText ? new Date(dateText).getTime() : 0,
        chain: detectChain(`${p.location?.osm_brand ?? ''}\n${p.location?.osm_name ?? ''}`),
        storeName: name,
        city: p.location?.osm_address_city || undefined,
        discounted: Boolean(p.price_is_discounted),
      };
    })
    .sort((a, b) => b.date - a.date);
}
