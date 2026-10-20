import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { AppSettings } from '../db/repo';
import type { Store } from '../db/types';

const DEFAULT_SETTINGS: AppSettings = { ocrMode: 'auto' };

export function useSettings(): AppSettings {
  return (
    useLiveQuery(async () => {
      const rows = await db.settings.toArray();
      const s: AppSettings = { ...DEFAULT_SETTINGS };
      for (const r of rows) (s as unknown as Record<string, unknown>)[r.key] = r.value;
      return s;
    }) ?? DEFAULT_SETTINGS
  );
}

export function useStores(): Store[] {
  return useLiveQuery(() => db.stores.orderBy('id').toArray()) ?? [];
}

const SERIES = 8;

/** Feste Diagrammfarbe je Markt (Farbe folgt dem Markt, nicht seinem Rang). */
export function storeColor(stores: readonly Store[], storeId: number | undefined): string {
  const index = stores.findIndex((s) => s.id === storeId);
  if (index < 0 || index >= SERIES) return 'var(--series-other)';
  return `var(--series-${index + 1})`;
}
